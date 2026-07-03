import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VariationSelectionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartQueryDto } from './dto/cart-query.dto';
import { AddCartAddOnDto, AddCartItemDto } from './dto/add-cart-item.dto';

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variationOption: true,
      selectedVariations: {
        orderBy: { createdAt: 'asc' as const },
        include: { variationOption: true },
      },
      addOns: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          product: {
            include: {
              images: {
                orderBy: [
                  { isPrimary: 'desc' as const },
                  { sortOrder: 'asc' as const },
                  { createdAt: 'asc' as const },
                ],
              },
            },
          },
          variationOption: true,
        },
      },
      product: {
        include: {
          category: true,
          variationOptions: {
            orderBy: [
              { isDefault: 'desc' as const },
              { displayOrder: 'asc' as const },
            ],
          },
          images: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { sortOrder: 'asc' as const },
              { createdAt: 'asc' as const },
            ],
          },
        },
      },
    },
  },
};

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

const managementCartInclude = {
  ...cartInclude,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
    },
  },
};

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    return this.toCartView(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const quantity = dto.quantity ?? 1;
    this.assertQuantity(quantity);
    const cart = await this.findOrCreateCart(userId);
    const prepared = await this.prepareCartSelection(dto, quantity);
    const existing = cart.items.find((item) => item.configKey === prepared.configKey);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    prepared.stockChecks.forEach((check) =>
      this.assertStock(check.stock, check.quantity * nextQuantity),
    );

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: prepared.product.id,
          variationOptionId: prepared.variationOption?.id ?? null,
          quantity,
          unitPrice: prepared.unitPrice,
          specialInstructions: prepared.specialInstructions,
          configKey: prepared.configKey,
          selectedVariations: prepared.selectedVariations.length
            ? {
                create: prepared.selectedVariations.map((selection) => ({
                  variationOptionId: selection.option.id,
                  quantity: selection.quantity,
                  unitPrice: selection.unitPrice,
                })),
              }
            : undefined,
          addOns: prepared.addOns.length
            ? {
                create: prepared.addOns.map((addOn) => ({
                  productId: addOn.product.id,
                  variationOptionId: addOn.variationOption?.id ?? null,
                  quantity: addOn.quantity,
                  unitPrice: addOn.unitPrice,
                })),
              }
            : undefined,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be a whole number greater than 0');
    }

    const item = await this.findOwnedItem(userId, itemId);
    this.assertQuantity(quantity);
    if (item.selectedVariations.length) {
      item.selectedVariations.forEach((selection) =>
        this.assertStock(selection.variationOption, selection.quantity * quantity),
      );
    } else {
      const stock = item.variationOption ?? item.product;
      this.assertStock(stock, quantity);
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.findOwnedItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  async findManagement(query: CartQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where: Prisma.CartWhereInput = search
      ? {
          OR: [
            { user: { name: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            { user: { phone: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cart.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: managementCartInclude,
      }),
      this.prisma.cart.count({ where }),
    ]);

    const data = items.map((cart) => this.toManagementCartView(cart));
    const metrics = data.reduce(
      (acc, cart) => ({
        activeCarts: acc.activeCarts + (cart.summary.uniqueItems > 0 ? 1 : 0),
        emptyCarts: acc.emptyCarts + (cart.summary.uniqueItems === 0 ? 1 : 0),
        totalCartValue: acc.totalCartValue + cart.summary.total,
        totalItems: acc.totalItems + cart.summary.itemCount,
      }),
      { activeCarts: 0, emptyCarts: 0, totalCartValue: 0, totalItems: 0 },
    );

    return {
      data,
      metrics,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findManagementOne(id: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: managementCartInclude,
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return this.toManagementCartView(cart);
  }

  private async findOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include: cartInclude,
    });
    if (existing) return existing;

    return this.prisma.cart.create({
      data: { userId },
      include: cartInclude,
    });
  }

  private async findPurchasableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        variationOptions: {
          orderBy: [
            { isDefault: 'desc' },
            { displayOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        frequentlyBoughtItems: {
          where: { isActive: true },
          include: { relatedProduct: true },
        },
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (!product.isActive || !product.isAvailable) {
      throw new BadRequestException('Product is not available');
    }
    const inStock = product.variationOptions.some(
      (option) => option.isActive && option.stockQuantity > 0,
    );
    if (!inStock) {
      throw new BadRequestException('Product is out of stock');
    }
    return product;
  }

  private async findOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: { select: { userId: true } },
        variationOption: true,
        selectedVariations: {
          include: { variationOption: true },
        },
        product: {
          include: {
            category: true,
            variationOptions: {
              orderBy: [
                { isDefault: 'desc' },
                { displayOrder: 'asc' },
                { createdAt: 'asc' },
              ],
            },
            images: {
              orderBy: [
                { isPrimary: 'desc' },
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
              ],
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Cart item not found');
    if (item.cart.userId !== userId) {
      throw new ForbiddenException('Cannot modify another user cart');
    }
    if (!item.product.isActive || !item.product.isAvailable) {
      throw new BadRequestException('Product is not available');
    }
    return item;
  }

  private async prepareCartSelection(dto: AddCartItemDto, quantity: number) {
    const product = await this.findPurchasableProduct(dto.productId);
    const selectedVariations = this.resolveVariationSelections(product, dto);
    const variationOption = selectedVariations[0]?.option ?? null;
    const specialInstructions = this.cleanSpecialInstructions(
      product,
      dto.specialInstructions,
    );
    const addOns = await this.resolveAddOns(product.id, dto.addOns ?? []);
    const unitPrice = selectedVariations.reduce(
      (sum, selection) => sum + selection.unitPrice * selection.quantity,
      0,
    );

    const stockChecks = selectedVariations.length
      ? selectedVariations.map((selection) => ({
          stock: selection.option,
          quantity: selection.quantity,
        }))
      : [];
    stockChecks.forEach((check) =>
      this.assertStock(check.stock, check.quantity * quantity),
    );

    const configKey = this.createConfigKey({
      productId: product.id,
      variationOptionId: variationOption?.id ?? null,
      variationSelections: selectedVariations.map((selection) => ({
        variationOptionId: selection.option.id,
        quantity: selection.quantity,
      })),
      addOns: addOns.map((addOn) => ({
        productId: addOn.product.id,
        variationOptionId: addOn.variationOption?.id ?? null,
        quantity: addOn.quantity,
      })),
      specialInstructions,
    });

    return {
      product,
      variationOption,
      unitPrice,
      selectedVariations,
      stockChecks,
      addOns,
      specialInstructions,
      configKey,
    };
  }

  private resolveVariationSelections(
    product: Awaited<ReturnType<CartService['findPurchasableProduct']>>,
    dto: AddCartItemDto,
  ) {
    const activeOptions = product.variationOptions.filter((option) => option.isActive);
    const requestedSelections =
      dto.variationSelections?.length
        ? dto.variationSelections
        : dto.variationOptionId
          ? [{ variationOptionId: dto.variationOptionId, quantity: 1 }]
          : [];
    if (requestedSelections.length === 0) {
      throw new BadRequestException('Select a variation option');
    }
    if (product.variationSelectionType === VariationSelectionType.SINGLE && requestedSelections.length > 1) {
      throw new BadRequestException('Only one variation option can be selected');
    }
    if (
      requestedSelections.length < product.minVariationSelections ||
      requestedSelections.length > product.maxVariationSelections
    ) {
      throw new BadRequestException('Selected variation count is outside allowed limits');
    }

    const seen = new Set<string>();
    return requestedSelections.map((selection) => {
      const option = activeOptions.find(
        (item) => item.id === selection.variationOptionId,
      );
      if (!option || option.productId !== product.id) {
        throw new BadRequestException('Select a valid variation option');
      }
      if (seen.has(option.id)) {
        throw new BadRequestException('Duplicate variation options are not allowed');
      }
      seen.add(option.id);
      const optionQuantity = selection.quantity ?? option.minQuantity;
      if (optionQuantity < option.minQuantity || optionQuantity > option.maxQuantity) {
        throw new BadRequestException('Variation quantity is outside allowed limits');
      }
      if (option.stockQuantity <= 0) {
        throw new BadRequestException('Selected variation is out of stock');
      }
      return {
        option,
        quantity: optionQuantity,
        unitPrice: this.effectiveOptionPrice(option),
      };
    });
  }

  private resolveVariationOption(
    product: Awaited<ReturnType<CartService['findPurchasableProduct']>>,
    requestedId?: string,
  ) {
    return this.resolveVariationSelections(product, {
      productId: product.id,
      variationOptionId: requestedId,
    })[0]?.option ?? null;
  }

  private effectiveOptionPrice(option: { price: number; salePrice: number | null } | null) {
    if (!option) {
      throw new BadRequestException('Select a valid variation option');
    }
    return option.salePrice ?? option.price;
  }

  private async resolveAddOns(parentProductId: string, addOns: AddCartAddOnDto[]) {
    if (!addOns.length) return [];

    const allowed = await this.prisma.productFrequentlyBoughtItem.findMany({
      where: { productId: parentProductId, isActive: true },
      include: {
        relatedProduct: {
          include: {
            variationOptions: {
              orderBy: [
                { isDefault: 'desc' },
                { displayOrder: 'asc' },
                { createdAt: 'asc' },
              ],
            },
            images: true,
          },
        },
      },
    });
    const allowedByProductId = new Map(
      allowed.map((item) => [item.relatedProductId, item]),
    );
    const seen = new Set<string>();

    return addOns.map((input) => {
      const relation = allowedByProductId.get(input.productId);
      if (!relation) {
        throw new BadRequestException('Selected add-on is not allowed for this product');
      }
      const product = relation.relatedProduct;
      if (!product.isActive || !product.isAvailable) {
        throw new BadRequestException('Selected add-on is not available');
      }
      const variationOption = this.resolveAddOnVariation(product, input.variationOptionId);
      const quantity = input.quantity ?? relation.minQuantity;
      if (quantity < relation.minQuantity || quantity > relation.maxQuantity) {
        throw new BadRequestException('Add-on quantity is outside allowed limits');
      }
      this.assertStock(variationOption ?? product, quantity);
      const key = `${product.id}:${variationOption?.id ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException('Duplicate add-ons are not allowed');
      }
      seen.add(key);
      return {
        product,
        variationOption,
        quantity,
        unitPrice: this.effectiveOptionPrice(variationOption),
      };
    });
  }

  private resolveAddOnVariation(
    product: Prisma.ProductGetPayload<{
      include: { variationOptions: true; images: true };
    }>,
    requestedId?: string,
  ) {
    const activeOptions = product.variationOptions.filter((option) => option.isActive);
    const option = requestedId
      ? activeOptions.find((item) => item.id === requestedId)
      : activeOptions.find((item) => item.isDefault) ?? activeOptions[0];
    if (!option || option.productId !== product.id) {
      throw new BadRequestException('Select a valid add-on variation');
    }
    if (option.stockQuantity <= 0) {
      throw new BadRequestException('Selected add-on variation is out of stock');
    }
    return option;
  }

  private cleanSpecialInstructions(
    product: Awaited<ReturnType<CartService['findPurchasableProduct']>>,
    value?: string,
  ) {
    const clean = value?.trim();
    if (!clean) return null;
    if (!product.allowSpecialInstructions) {
      throw new BadRequestException('Special instructions are not allowed for this product');
    }
    if (clean.length > product.specialInstructionsMaxLength) {
      throw new BadRequestException('Special instructions are too long');
    }
    return clean;
  }

  private assertQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('Quantity must be between 1 and 99');
    }
  }

  private assertStock(stock: { stockQuantity: number }, quantity: number) {
    if (quantity > stock.stockQuantity) {
      throw new BadRequestException('Quantity exceeds available stock');
    }
  }

  private createConfigKey(input: {
    productId: string;
    variationOptionId: string | null;
    variationSelections?: Array<{
      variationOptionId: string;
      quantity: number;
    }>;
    addOns: Array<{
      productId: string;
      variationOptionId: string | null;
      quantity: number;
    }>;
    specialInstructions: string | null;
  }) {
    return JSON.stringify({
      productId: input.productId,
      variationOptionId: input.variationOptionId,
      variationSelections: [...(input.variationSelections ?? [])].sort((a, b) =>
        a.variationOptionId.localeCompare(b.variationOptionId),
      ),
      addOns: [...input.addOns].sort((a, b) =>
        `${a.productId}:${a.variationOptionId ?? ''}`.localeCompare(
          `${b.productId}:${b.variationOptionId ?? ''}`,
        ),
      ),
      specialInstructions: input.specialInstructions ?? '',
    });
  }

  private toCartView(cart: CartWithItems) {
    const items = cart.items.map((item) => {
      const selectedVariations = item.selectedVariations.map((selection) => ({
        id: selection.id,
        variationOptionId: selection.variationOptionId,
        quantity: selection.quantity,
        unitPrice: selection.unitPrice,
        subtotal: selection.unitPrice * selection.quantity * item.quantity,
        option: {
          id: selection.variationOption.id,
          name: selection.variationOption.name,
          price: selection.variationOption.price,
          salePrice: selection.variationOption.salePrice,
          effectivePrice: this.effectiveOptionPrice(selection.variationOption),
        },
      }));
      const unitPrice =
        item.unitPrice ??
        (selectedVariations.length
          ? selectedVariations.reduce(
              (sum, selection) => sum + selection.unitPrice * selection.quantity,
              0,
            )
          : item.variationOption
            ? this.effectiveOptionPrice(item.variationOption)
            : 0);
      const addOns = item.addOns.map((addOn) => {
        const image = addOn.product.images[0] ?? null;
        const subtotal = addOn.unitPrice * addOn.quantity * item.quantity;
        return {
          id: addOn.id,
          productId: addOn.productId,
          variationOptionId: addOn.variationOptionId,
          quantity: addOn.quantity,
          unitPrice: addOn.unitPrice,
          subtotal,
          product: {
            id: addOn.product.id,
            slug: addOn.product.slug,
            title: addOn.product.title,
            image: image
              ? { url: image.url, altText: image.altText }
              : null,
          },
          variationOption: addOn.variationOption
            ? {
                id: addOn.variationOption.id,
                name: addOn.variationOption.name,
                price: addOn.variationOption.price,
                salePrice: addOn.variationOption.salePrice,
              }
            : null,
        };
      });
      const addOnsSubtotal = addOns.reduce((sum, addOn) => sum + addOn.subtotal, 0);
      const baseSubtotal = selectedVariations.length
        ? selectedVariations.reduce((sum, selection) => sum + selection.subtotal, 0)
        : unitPrice * item.quantity;
      const subtotal = baseSubtotal + addOnsSubtotal;
      const primaryImage = item.product.images[0] ?? null;
      const isAvailable =
        item.product.isActive &&
        item.product.isAvailable &&
        (selectedVariations.length
          ? selectedVariations.every(
              (selection) =>
                item.selectedVariations.find((row) => row.id === selection.id)
                  ?.variationOption.isActive,
            )
          : item.variationOption
          ? item.variationOption.isActive && item.variationOption.stockQuantity > 0
          : item.product.variationOptions.some(
              (option) => option.isActive && option.stockQuantity > 0,
            ));

      return {
        id: item.id,
        productId: item.productId,
        variationOptionId: item.variationOptionId,
        selectedVariations,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        specialInstructions: item.specialInstructions,
        configKey: item.configKey,
        isAvailable,
        exceedsStock:
          selectedVariations.length > 0
            ? item.selectedVariations.some(
                (selection) =>
                  selection.quantity * item.quantity >
                  selection.variationOption.stockQuantity,
              )
            : item.quantity >
              (item.variationOption?.stockQuantity ?? 0),
        variationOption: item.variationOption
          ? {
              id: item.variationOption.id,
              name: item.variationOption.name,
              price: item.variationOption.price,
              salePrice: item.variationOption.salePrice,
              effectivePrice: this.effectiveOptionPrice(item.variationOption),
            }
          : null,
        addOns,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          title: item.product.title,
          productType: item.product.productType,
          price: item.product.price,
          discountedPrice: item.product.discountedPrice,
          stockQuantity: item.product.stockQuantity,
          isActive: item.product.isActive,
          isAvailable: item.product.isAvailable,
          category: {
            id: item.product.category.id,
            slug: item.product.category.slug,
            name: item.product.category.name,
          },
          image: primaryImage
            ? {
                url: primaryImage.url,
                altText: primaryImage.altText,
              }
            : null,
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const unavailableCount = items.filter(
      (item) => !item.isAvailable || item.exceedsStock,
    ).length;

    return {
      id: cart.id,
      userId: cart.userId,
      items,
      summary: {
        itemCount,
        uniqueItems: items.length,
        subtotal,
        discount: 0,
        shipping: 0,
        tax: 0,
        total: subtotal,
        unavailableCount,
      },
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  private toManagementCartView(
    cart: Prisma.CartGetPayload<{ include: typeof managementCartInclude }>,
  ) {
    return {
      ...this.toCartView(cart),
      customer: cart.user,
    };
  }
}
