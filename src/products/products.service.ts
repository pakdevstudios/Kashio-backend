import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductImageDto, UpdateProductImageDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
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
    this.assertValidPricing(dto.price, dto.discountedPrice);

    return this.prisma.product.create({
      data: {
        title,
        slug,
        description: this.cleanOptional(dto.description),
        categoryId: dto.categoryId,
        supplierId: dto.supplierId || null,
        storeName: this.cleanOptional(dto.storeName),
        price: dto.price,
        discountedPrice: dto.discountedPrice,
        stockQuantity: dto.stockQuantity ?? 0,
        isActive: dto.isActive ?? true,
        isAvailable: dto.isAvailable ?? true,
        images: dto.images?.length
          ? { create: this.normalizeImages(dto.images) }
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
    return this.toPublicProduct(product);
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
      data: items,
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
    if (dto.price !== undefined || dto.discountedPrice !== undefined) {
      this.assertValidPricing(
        dto.price ?? existing.price,
        dto.discountedPrice ?? existing.discountedPrice ?? undefined,
      );
    }
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.discountedPrice !== undefined) data.discountedPrice = dto.discountedPrice;
    if (dto.stockQuantity !== undefined) data.stockQuantity = dto.stockQuantity;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;
    if (dto.images !== undefined) {
      data.images = {
        deleteMany: {},
        create: this.normalizeImages(dto.images),
      };
    }

    return this.prisma.product.update({
      where: { id },
      data,
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
    await this.findManagementOne(id);
    this.assertValidPricing(dto.price, dto.discountedPrice);
    return this.prisma.product.update({
      where: { id },
      data: {
        price: dto.price,
        discountedPrice: dto.discountedPrice,
      },
      include: productInclude,
    });
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
    await this.findManagementOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { stockQuantity: dto.stockQuantity },
      include: productInclude,
    });
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

  private toPublicProduct(product: ProductWithRelations) {
    return {
      slug: product.slug,
      title: product.title,
      description: product.description,
      storeName: product.storeName,
      price: product.price,
      discountedPrice: product.discountedPrice,
      effectivePrice: product.discountedPrice ?? product.price,
      isAvailable: product.isAvailable,
      stockQuantity: product.stockQuantity,
      inStock: product.stockQuantity > 0,
      category: {
        slug: product.category.slug,
        name: product.category.name,
        description: product.category.description,
      },
      images: product.images.map((image) => ({
        url: image.url,
        altText: image.altText,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
    };
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
