import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import {
  AssignSupplierProductsDto,
  UpdateSupplierDto,
  UpdateSupplierStatusDto,
} from './dto/update-supplier.dto';

const supplierInclude = {
  products: {
    include: { category: true, images: true },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    const name = this.normalizeText(dto.name);
    const slug = await this.createAvailableSlug(name);
    const productIds = this.uniqueIds(dto.productIds);

    if (productIds.length) await this.assertProductsExist(productIds);

    const supplier = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          name,
          slug,
          companyName: this.cleanOptional(dto.companyName),
          contactName: this.cleanOptional(dto.contactName),
          email: this.cleanOptional(dto.email)?.toLowerCase() ?? null,
          phone: this.cleanOptional(dto.phone),
          address: this.cleanOptional(dto.address),
          city: this.cleanOptional(dto.city),
          notes: this.cleanOptional(dto.notes),
          status: dto.status ?? SupplierStatus.PENDING,
        },
      });

      if (productIds.length) {
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { supplierId: created.id },
        });
      }

      return created;
    });

    return this.findOne(supplier.id);
  }

  async findAll(query: SupplierQueryDto) {
    const where: Prisma.SupplierWhereInput = {};
    const search = query.search?.trim();

    if (query.status) where.status = query.status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.supplier.findMany({
      where,
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      include: supplierInclude,
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: supplierInclude,
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    const productIds = dto.productIds === undefined ? undefined : this.uniqueIds(dto.productIds);
    if (productIds?.length) await this.assertProductsExist(productIds);

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.name !== undefined) {
      const name = this.normalizeText(dto.name);
      data.name = name;
      data.slug = await this.createAvailableSlug(name, id);
    }
    if (dto.companyName !== undefined) data.companyName = this.cleanOptional(dto.companyName);
    if (dto.contactName !== undefined) data.contactName = this.cleanOptional(dto.contactName);
    if (dto.email !== undefined) data.email = this.cleanOptional(dto.email)?.toLowerCase() ?? null;
    if (dto.phone !== undefined) data.phone = this.cleanOptional(dto.phone);
    if (dto.address !== undefined) data.address = this.cleanOptional(dto.address);
    if (dto.city !== undefined) data.city = this.cleanOptional(dto.city);
    if (dto.notes !== undefined) data.notes = this.cleanOptional(dto.notes);
    if (dto.status !== undefined) data.status = dto.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data });
      if (productIds !== undefined) {
        await tx.product.updateMany({
          where: { supplierId: id, id: { notIn: productIds } },
          data: { supplierId: null },
        });
        if (productIds.length) {
          await tx.product.updateMany({
            where: { id: { in: productIds } },
            data: { supplierId: id },
          });
        }
      }
    });

    return this.findOne(id);
  }

  async updateStatus(id: string, dto: UpdateSupplierStatusDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { status: dto.status },
      include: supplierInclude,
    });
  }

  async assignProducts(id: string, dto: AssignSupplierProductsDto) {
    await this.findOne(id);
    const productIds = this.uniqueIds(dto.productIds);
    if (productIds.length) await this.assertProductsExist(productIds);

    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { supplierId: id, id: { notIn: productIds } },
        data: { supplierId: null },
      }),
      ...(productIds.length
        ? [
            this.prisma.product.updateMany({
              where: { id: { in: productIds } },
              data: { supplierId: id },
            }),
          ]
        : []),
    ]);

    return this.findOne(id);
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { status: SupplierStatus.INACTIVE },
      include: supplierInclude,
    });
  }

  private async assertProductsExist(productIds: string[]) {
    const count = await this.prisma.product.count({
      where: { id: { in: productIds } },
    });
    if (count !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }
  }

  private async createAvailableSlug(name: string, currentId?: string) {
    const base = this.slugify(name);
    let slug = base;
    let suffix = 2;

    while (await this.slugExists(slug, currentId)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, currentId?: string) {
    const existing = await this.prisma.supplier.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return false;
    return existing.id !== currentId;
  }

  private normalizeText(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new BadRequestException('Supplier name is required');
    return normalized;
  }

  private cleanOptional(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private uniqueIds(ids?: string[]) {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      throw new BadRequestException('Supplier name must include letters or numbers');
    }
    return slug;
  }
}
