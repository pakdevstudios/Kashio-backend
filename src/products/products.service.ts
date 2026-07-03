import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType, VariationSelectionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductImageDto, UpdateProductImageDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import {
  FrequentlyBoughtItemDto,
  ProductVariationOptionDto,
} from './dto/product-variation.dto';
import {
  UpdateProductAvailabilityDto,
  AssignProductsSupplierDto,
  UpdateProductDto,
  UpdateProductPricingDto,
  UpdateProductStockDto,
} from './dto/update-product.dto';

const productInclude = {
  category: true,
  supplier: true,
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  variationOptions: {
    orderBy: [{ isDefault: 'desc' as const }, { displayOrder: 'asc' as const }],
  },
  frequentlyBoughtItems: {
    orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      relatedProduct: {
        include: {
          category: true,
          images: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { sortOrder: 'asc' as const },
              { createdAt: 'asc' as const },
            ],
          },
          variationOptions: {
            orderBy: [
              { isDefault: 'desc' as const },
              { displayOrder: 'asc' as const },
            ],
          },
        },
      },
    },
  },
};

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const title = this.normalizeText(dto.title);
    const slug = await this.createAvailableSlug(title);
    await this.assertCategoryExists(dto.categoryId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    await this.validateProductConfiguration(dto);
    const variationOptions = this.normalizeVariationOptions(dto.variationOptions ?? []);
    const derived = this.deriveProductPricing(variationOptions);

    return this.prisma.product.create({
      data: {
        title,
        slug,
        description: this.cleanOptional(dto.description),
        categoryId: dto.categoryId,
        supplierId: dto.supplierId || null,
        storeName: this.cleanOptional(dto.storeName),
        productType: ProductType.VARIABLE,
        price: derived.price,
        discountedPrice: derived.discountedPrice,
        stockQuantity: derived.stockQuantity,
        variationLabel: this.normalizeText(dto.variationLabel ?? 'Variation'),
        variationSelectionType:
          dto.variationSelectionType ?? VariationSelectionType.SINGLE,
        isVariationRequired: dto.isVariationRequired ?? true,
        minVariationSelections: dto.minVariationSelections ?? 1,
        maxVariationSelections: dto.maxVariationSelections ?? 1,
        allowSpecialInstructions: dto.allowSpecialInstructions ?? false,
        specialInstructionsPlaceholder: this.cleanOptional(
          dto.specialInstructionsPlaceholder,
        ),
        specialInstructionsMaxLength: dto.specialInstructionsMaxLength ?? 250,
        isActive: dto.isActive ?? true,
        isAvailable: dto.isAvailable ?? true,
        images: dto.images?.length
          ? { create: this.normalizeImages(dto.images) }
          : undefined,
        variationOptions: { create: variationOptions },
        frequentlyBoughtItems: dto.frequentlyBoughtItems?.length
          ? {
              create: await this.normalizeFrequentlyBoughtItems(
                dto.frequentlyBoughtItems,
              ),
            }
          : undefined,
      },
      include: productInclude,
    });
  }

  async findPublic(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildPublicWhere(query);
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((product) => this.toPublicProduct(product)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicOne(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: productInclude,
    });

    if (!product) throw new NotFoundException('Product not found');
    return this.toPublicProduct(product, true);
  }

  async findManagement(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildManagementWhere(query);
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((product) => this.toManagementProduct(product)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findManagementOne(id);

    const data: Prisma.ProductUpdateInput = {};
    if (dto.title !== undefined) {
      const title = this.normalizeText(dto.title);
      data.title = title;
      data.slug = await this.createAvailableSlug(title, id);
    }
    if (dto.description !== undefined) {
      data.description = this.cleanOptional(dto.description);
    }
    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
      data.category = { connect: { id: dto.categoryId } };
    }
    if (dto.storeName !== undefined) {
      data.storeName = this.cleanOptional(dto.storeName);
    }
    if (dto.supplierId !== undefined) {
      if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
      data.supplier = dto.supplierId
        ? { connect: { id: dto.supplierId } }
        : { disconnect: true };
    }
    data.productType = ProductType.VARIABLE;
    if (dto.variationLabel !== undefined) {
      data.variationLabel = this.normalizeText(dto.variationLabel || 'Variation');
    }
    if (dto.variationSelectionType !== undefined) {
      data.variationSelectionType = dto.variationSelectionType;
    }
    if (dto.isVariationRequired !== undefined) {
      data.isVariationRequired = dto.isVariationRequired;
    }
    if (dto.minVariationSelections !== undefined) {
      data.minVariationSelections = dto.minVariationSelections;
    }
    if (dto.maxVariationSelections !== undefined) {
      data.maxVariationSelections = dto.maxVariationSelections;
    }
    if (dto.allowSpecialInstructions !== undefined) {
      data.allowSpecialInstructions = dto.allowSpecialInstructions;
    }
    if (dto.specialInstructionsPlaceholder !== undefined) {
      data.specialInstructionsPlaceholder = this.cleanOptional(
        dto.specialInstructionsPlaceholder,
      );
    }
    if (dto.specialInstructionsMaxLength !== undefined) {
      data.specialInstructionsMaxLength = dto.specialInstructionsMaxLength;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;
    if (dto.images !== undefined) {
      data.images = {
        deleteMany: {},
        create: this.normalizeImages(dto.images),
      };
    }
    const nextVariationOptions = dto.variationOptions ?? existing.variationOptions;
    await this.validateProductConfiguration({
      productType: ProductType.VARIABLE,
      variationSelectionType:
        dto.variationSelectionType ?? existing.variationSelectionType,
      isVariationRequired:
        dto.isVariationRequired ?? existing.isVariationRequired,
      minVariationSelections:
        dto.minVariationSelections ?? existing.minVariationSelections,
      maxVariationSelections:
        dto.maxVariationSelections ?? existing.maxVariationSelections,
      variationOptions: nextVariationOptions,
      frequentlyBoughtItems:
        dto.frequentlyBoughtItems ?? existing.frequentlyBoughtItems,
    });
    const normalizedVariationOptions =
      dto.variationOptions !== undefined
        ? this.normalizeVariationOptions(dto.variationOptions)
        : existing.variationOptions.map((option) => ({
            name: option.name,
            sku: option.sku,
            price: option.price,
            salePrice: option.salePrice,
            stockQuantity: option.stockQuantity,
            isActive: option.isActive,
            isDefault: option.isDefault,
            minQuantity: option.minQuantity,
            maxQuantity: option.maxQuantity,
            displayOrder: option.displayOrder,
            imageUrl: option.imageUrl,
          }));
    const derived = this.deriveProductPricing(normalizedVariationOptions);

    return this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        price: derived.price,
        discountedPrice: derived.discountedPrice,
        stockQuantity: derived.stockQuantity,
        variationOptions:
          dto.variationOptions !== undefined
            ? {
                deleteMany: {},
                create: this.normalizeVariationOptions(dto.variationOptions),
              }
            : undefined,
        frequentlyBoughtItems:
          dto.frequentlyBoughtItems !== undefined
            ? {
                deleteMany: {},
                create: await this.normalizeFrequentlyBoughtItems(
                  dto.frequentlyBoughtItems,
                  id,
                ),
              }
            : undefined,
      },
      include: productInclude,
    });
  }

  async deactivate(id: string) {
    await this.findManagementOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false, isAvailable: false },
      include: productInclude,
    });
  }

  async updatePricing(id: string, dto: UpdateProductPricingDto) {
    void dto;
    await this.findManagementOne(id);
    throw new BadRequestException('Product pricing is managed through variations');
  }

  async updateAvailability(id: string, dto: UpdateProductAvailabilityDto) {
    if (dto.isActive === undefined && dto.isAvailable === undefined) {
      throw new BadRequestException('Provide isActive or isAvailable');
    }
    await this.findManagementOne(id);
    return this.prisma.product.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        isAvailable: dto.isAvailable,
      },
      include: productInclude,
    });
  }

  async updateStock(id: string, dto: UpdateProductStockDto) {
    void dto;
    await this.findManagementOne(id);
    throw new BadRequestException('Product stock is managed through variations');
  }

  async assignSupplier(dto: AssignProductsSupplierDto) {
    const productIds = [...new Set(dto.productIds.map((id) => id.trim()).filter(Boolean))];
    if (!productIds.length) {
      throw new BadRequestException('Select at least one product');
    }
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    await this.assertProductsExist(productIds);

    await this.prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { supplierId: dto.supplierId || null },
    });

    return { success: true };
  }

  async addImage(productId: string, dto: ProductImageDto) {
    await this.findManagementOne(productId);
    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        url: dto.url.trim(),
        altText: this.cleanOptional(dto.altText),
        sortOrder: dto.sortOrder ?? 0,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async updateImage(productId: string, imageId: string, dto: UpdateProductImageDto) {
    await this.findProductImage(productId, imageId);
    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, id: { not: imageId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        url: dto.url?.trim(),
        altText:
          dto.altText !== undefined ? this.cleanOptional(dto.altText) : undefined,
        sortOrder: dto.sortOrder,
        isPrimary: dto.isPrimary,
      },
    });
  }

  async deleteImage(productId: string, imageId: string) {
    await this.findProductImage(productId, imageId);
    await this.prisma.productImage.delete({ where: { id: imageId } });
    return { success: true };
  }

  private buildPublicWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { isActive: true };
    this.applyBrowseFilters(where, query);
    return where;
  }

  private buildManagementWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};
    this.applyBrowseFilters(where, query);
    return where;
  }

  private applyBrowseFilters(
    where: Prisma.ProductWhereInput,
    query: ProductQueryDto,
  ) {
    const search = query.search?.trim();

    if (typeof query.isAvailable === 'boolean') {
      where.isAvailable = query.isAvailable;
    }
    if (typeof query.inStock === 'boolean') {
      where.stockQuantity = query.inStock ? { gt: 0 } : { equals: 0 };
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.categorySlug) {
      where.category = { slug: query.categorySlug };
    }
    if (query.storeName) {
      where.storeName = { contains: query.storeName.trim(), mode: 'insensitive' };
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        gte: query.minPrice,
        lte: query.maxPrice,
      };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { storeName: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
  }

  private async findManagementOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async findProductImage(productId: string, imageId: string) {
    await this.findManagementOne(productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException('Product image not found');
    return image;
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  private async assertSupplierExists(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
  }

  private async assertProductsExist(productIds: string[]) {
    const count = await this.prisma.product.count({
      where: { id: { in: productIds } },
    });
    if (count !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }
  }

  private async validateProductConfiguration(dto: {
    productType?: ProductType;
    variationSelectionType?: VariationSelectionType;
    isVariationRequired?: boolean;
    minVariationSelections?: number;
    maxVariationSelections?: number;
    variationOptions?: ProductVariationOptionDto[] | ProductWithRelations['variationOptions'];
    frequentlyBoughtItems?:
      | FrequentlyBoughtItemDto[]
      | ProductWithRelations['frequentlyBoughtItems'];
  }) {
    const minSelections = dto.minVariationSelections ?? 1;
    const maxSelections = dto.maxVariationSelections ?? 1;

    if (maxSelections < minSelections) {
      throw new BadRequestException('Maximum selections cannot be less than minimum selections');
    }
    if (dto.variationSelectionType === VariationSelectionType.SINGLE && maxSelections > 1) {
      throw new BadRequestException('Single-select products cannot allow more than one variation');
    }

    const options = dto.variationOptions ?? [];
    for (const option of options) {
      if (!option.name?.trim()) {
        throw new BadRequestException('Every variation option needs a name');
      }
      this.assertValidPricing(option.price, option.salePrice ?? undefined);
      const minQuantity = option.minQuantity ?? 1;
      const maxQuantity = option.maxQuantity ?? 99;
      if (maxQuantity < minQuantity) {
        throw new BadRequestException('Variation max quantity cannot be below min quantity');
      }
    }

    const activeOptions = options.filter((option) => option.isActive !== false);
    if (activeOptions.length === 0) {
      throw new BadRequestException('Products need at least one active variation');
    }

    const defaultCount = activeOptions.filter((option) => option.isDefault).length;
    if (defaultCount > 1 && dto.variationSelectionType !== VariationSelectionType.MULTIPLE) {
      throw new BadRequestException('Only one default variation is allowed for single-select products');
    }

    const relatedIds = (dto.frequentlyBoughtItems ?? [])
      .filter((item) => item.isActive !== false)
      .map((item) => item.relatedProductId);
    if (new Set(relatedIds).size !== relatedIds.length) {
      throw new BadRequestException('Duplicate frequently bought items are not allowed');
    }
    if (relatedIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: relatedIds } },
        select: { id: true, isActive: true },
      });
      if (products.length !== relatedIds.length) {
        throw new NotFoundException('One or more frequently bought products were not found');
      }
      if (products.some((product) => !product.isActive)) {
        throw new BadRequestException('Frequently bought products must be active');
      }
    }
  }

  private async createAvailableSlug(title: string, currentId?: string) {
    const base = this.slugify(title);
    let slug = base;
    let suffix = 2;

    while (await this.slugExists(slug, currentId)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, currentId?: string) {
    const existing = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return false;
    if (existing.id === currentId) return false;
    return true;
  }

  private assertValidPricing(price?: number, discountedPrice?: number) {
    if (
      price !== undefined &&
      discountedPrice !== undefined &&
      discountedPrice > price
    ) {
      throw new BadRequestException('Discounted price cannot exceed price');
    }
  }

  private normalizeImages(images: ProductImageDto[]) {
    const primaryIndex = images.findIndex((image) => image.isPrimary);
    return images.map((image, index) => ({
      url: image.url.trim(),
      altText: this.cleanOptional(image.altText),
      sortOrder: image.sortOrder ?? index,
      isPrimary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
    }));
  }

  private normalizeVariationOptions(options: ProductVariationOptionDto[]) {
    const primaryIndex = options.findIndex((option) => option.isDefault);
    return options.map((option, index) => {
      const minQuantity = option.minQuantity ?? 1;
      const maxQuantity = option.maxQuantity ?? 99;
      return {
        name: this.normalizeText(option.name),
        sku: this.cleanOptional(option.sku),
        price: option.price,
        salePrice: option.salePrice ?? null,
        stockQuantity: option.stockQuantity ?? 0,
        isActive: option.isActive ?? true,
        isDefault:
          primaryIndex >= 0
            ? index === primaryIndex
            : index === 0 && option.isActive !== false,
        minQuantity,
        maxQuantity,
        displayOrder: option.displayOrder ?? index,
        imageUrl: this.cleanOptional(option.imageUrl),
      };
    });
  }

  private deriveProductPricing(
    options: Array<{
      price: number;
      salePrice?: number | null;
      stockQuantity: number;
      isActive: boolean;
      isDefault: boolean;
    }>,
  ) {
    const activeOptions = options.filter((option) => option.isActive);
    if (!activeOptions.length) {
      throw new BadRequestException('Products need at least one active variation');
    }
    const defaultOption =
      activeOptions.find((option) => option.isDefault) ??
      [...activeOptions].sort(
        (a, b) => this.effectiveOptionPrice(a) - this.effectiveOptionPrice(b),
      )[0];
    return {
      price: defaultOption.price,
      discountedPrice: defaultOption.salePrice ?? null,
      stockQuantity: activeOptions.reduce(
        (sum, option) => sum + option.stockQuantity,
        0,
      ),
    };
  }

  private async normalizeFrequentlyBoughtItems(
    items: FrequentlyBoughtItemDto[],
    productId?: string,
  ) {
    const normalized = items.map((item, index) => {
      if (productId && item.relatedProductId === productId) {
        throw new BadRequestException(
          'A product cannot be assigned as its own frequently bought item',
        );
      }
      const minQuantity = item.minQuantity ?? 1;
      const maxQuantity = item.maxQuantity ?? 99;
      if (maxQuantity < minQuantity) {
        throw new BadRequestException('Add-on max quantity cannot be below min quantity');
      }
      return {
        relatedProductId: item.relatedProductId,
        isDefault: item.isDefault ?? false,
        isActive: item.isActive ?? true,
        minQuantity,
        maxQuantity,
        displayOrder: item.displayOrder ?? index,
      };
    });

    const activeIds = normalized
      .filter((item) => item.isActive)
      .map((item) => item.relatedProductId);
    if (new Set(activeIds).size !== activeIds.length) {
      throw new BadRequestException('Duplicate frequently bought items are not allowed');
    }

    return normalized;
  }

  private toManagementProduct(product: ProductWithRelations) {
    return {
      ...this.toPublicProduct(product, true),
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
        description: product.category.description,
      },
      supplier: product.supplier
        ? {
            id: product.supplier.id,
            name: product.supplier.name,
            status: product.supplier.status,
          }
        : null,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private toPublicProduct(product: ProductWithRelations, detail = false) {
    const activeOptions = product.variationOptions.filter((option) => option.isActive);
    const defaultOption =
      activeOptions.find((option) => option.isDefault) ?? activeOptions[0] ?? null;
    const lowestOption =
      activeOptions.length > 0
        ? [...activeOptions].sort((a, b) => this.effectiveOptionPrice(a) - this.effectiveOptionPrice(b))[0]
        : null;
    const displayOption = defaultOption ?? lowestOption;
    const effectivePrice = displayOption
      ? this.effectiveOptionPrice(displayOption)
      : product.discountedPrice ?? product.price;
    const stockQuantity = activeOptions.length
      ? activeOptions.reduce((sum, option) => sum + option.stockQuantity, 0)
      : product.stockQuantity;
    const primaryImage = product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null;

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      storeName: product.storeName,
      productType: ProductType.VARIABLE,
      price: product.price,
      discountedPrice: product.discountedPrice,
      effectivePrice,
      displayPrice: effectivePrice,
      startingPrice: lowestOption ? this.effectiveOptionPrice(lowestOption) : effectivePrice,
      priceLabel: defaultOption ? null : 'Starting from',
      isAvailable: product.isAvailable,
      stockQuantity,
      inStock: stockQuantity > 0,
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
        description: product.category.description,
      },
      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
        isCover: image.id === primaryImage?.id,
      })),
      image: primaryImage
        ? { url: primaryImage.url, altText: primaryImage.altText }
        : null,
      coverImage: primaryImage
        ? {
            url: primaryImage.url,
            altText: primaryImage.altText,
            sortOrder: primaryImage.sortOrder,
            isCover: true,
          }
        : null,
      variationConfig: {
        label: product.variationLabel,
        selectionType: product.variationSelectionType,
        required: product.isVariationRequired,
        minSelections: product.minVariationSelections,
        maxSelections: product.maxVariationSelections,
      },
      variationOptions: activeOptions.map((option) => ({
        id: option.id,
        name: option.name,
        sku: option.sku,
        price: option.price,
        salePrice: option.salePrice,
        effectivePrice: this.effectiveOptionPrice(option),
        stockQuantity: option.stockQuantity,
        inStock: option.stockQuantity > 0,
        isActive: option.isActive,
        isDefault: option.isDefault,
        minQuantity: option.minQuantity,
        maxQuantity: option.maxQuantity,
        displayOrder: option.displayOrder,
        imageUrl: option.imageUrl,
      })),
      frequentlyBoughtTogether: detail
        ? product.frequentlyBoughtItems
            .filter((item) => item.isActive && item.relatedProduct.isActive)
            .map((item) => {
              const related = item.relatedProduct;
              const relatedActiveOptions = related.variationOptions.filter(
                (option) => option.isActive,
              );
              const relatedDefaultOption =
                relatedActiveOptions.find((option) => option.isDefault) ??
                relatedActiveOptions[0] ??
                null;
              const relatedPrice = relatedDefaultOption
                ? this.effectiveOptionPrice(relatedDefaultOption)
                : related.price;
              const image =
                related.images.find((productImage) => productImage.isPrimary) ??
                related.images[0] ??
                null;
              return {
                id: item.id,
                productId: related.id,
                slug: related.slug,
                title: related.title,
                productType: ProductType.VARIABLE,
                price: related.price,
                discountedPrice: related.discountedPrice,
                effectivePrice: relatedPrice,
                defaultVariationOptionId: relatedDefaultOption?.id ?? null,
                image: image
                  ? { url: image.url, altText: image.altText }
                  : null,
                isDefault: item.isDefault,
                isActive: item.isActive,
                inStock:
                  relatedActiveOptions.some((option) => option.stockQuantity > 0),
                minQuantity: item.minQuantity,
                maxQuantity: item.maxQuantity,
                displayOrder: item.displayOrder,
                variationOptions: relatedActiveOptions.map((option) => ({
                  id: option.id,
                  name: option.name,
                  price: option.price,
                  salePrice: option.salePrice,
                  effectivePrice: this.effectiveOptionPrice(option),
                  stockQuantity: option.stockQuantity,
                  isDefault: option.isDefault,
                })),
              };
            })
        : [],
      specialInstructions: {
        allowed: product.allowSpecialInstructions,
        placeholder: product.specialInstructionsPlaceholder,
        maxLength: product.specialInstructionsMaxLength,
      },
      requiresCustomization: true,
    };
  }

  private effectiveOptionPrice(option: { price: number; salePrice?: number | null }) {
    return option.salePrice ?? option.price;
  }

  private normalizeText(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private cleanOptional(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      throw new BadRequestException('Product title must include letters or numbers');
    }
    return slug;
  }
}
