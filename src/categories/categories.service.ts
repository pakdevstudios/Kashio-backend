import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const name = this.normalizeName(dto.name);
    const slug = this.slugify(name);
    await this.assertSlugAvailable(slug);

    return this.prisma.category.create({
      data: {
        name,
        slug,
        description: this.cleanOptional(dto.description),
      },
    });
  }

  async findAll(query: CategoryQueryDto) {
    const where: Prisma.CategoryWhereInput = {};
    const search = query.search?.trim();

    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.category.findMany({
      where,
      orderBy: {
        [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      const slug = this.slugify(name);
      await this.assertSlugAvailable(slug, id);
      data.name = name;
      data.slug = slug;
    }
    if (dto.description !== undefined) {
      data.description = this.cleanOptional(dto.description);
    }

    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: { isActive },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  private async assertSlugAvailable(slug: string, currentId?: string) {
    const existing = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing && existing.id !== currentId) {
      throw new ConflictException('A category with this name already exists');
    }
  }

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  private cleanOptional(value?: string) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      throw new BadRequestException('Category name must include letters or numbers');
    }
    return slug;
  }
}
