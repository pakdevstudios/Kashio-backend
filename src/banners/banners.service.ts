import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BannerQueryDto } from './dto/banner-query.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateBannerDto) {
    this.assertImageUrl(dto.imageUrl);

    return this.prisma.banner.create({
      data: {
        title: this.normalizeText(dto.title),
        imageUrl: dto.imageUrl.trim(),
        redirectUrl: this.cleanOptional(dto.redirectUrl),
        targetType: this.cleanOptional(dto.targetType),
        targetId: this.cleanOptional(dto.targetId),
        displayOrder: dto.displayOrder,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findPublic(query: BannerQueryDto) {
    return this.prisma.banner.findMany({
      where: this.buildWhere({ ...query, isActive: true }),
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findManagement(query: BannerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = this.buildWhere(query);
    const orderBy =
      query.sortBy === 'createdAt'
        ? [{ createdAt: query.sortOrder ?? 'desc' }]
        : query.sortBy === 'title'
          ? [{ title: query.sortOrder ?? 'asc' }]
          : [
              { displayOrder: query.sortOrder ?? 'asc' },
              { createdAt: 'desc' as const },
            ];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.banner.count({ where }),
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

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    if (dto.imageUrl !== undefined) {
      this.assertImageUrl(dto.imageUrl);
    }

    const data: Prisma.BannerUpdateInput = {};
    if (dto.title !== undefined) data.title = this.normalizeText(dto.title);
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl.trim();
    if (dto.redirectUrl !== undefined) {
      data.redirectUrl = this.cleanOptional(dto.redirectUrl);
    }
    if (dto.targetType !== undefined) {
      data.targetType = this.cleanOptional(dto.targetType);
    }
    if (dto.targetId !== undefined) data.targetId = this.cleanOptional(dto.targetId);
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.banner.update({
      where: { id },
      data,
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.banner.update({
      where: { id },
      data: { isActive },
    });
  }

  async setOrder(id: string, displayOrder: number) {
    await this.findOne(id);
    return this.prisma.banner.update({
      where: { id },
      data: { displayOrder },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.banner.delete({ where: { id } });
    return { success: true };
  }

  private buildWhere(query: BannerQueryDto): Prisma.BannerWhereInput {
    const where: Prisma.BannerWhereInput = {};
    const search = query.search?.trim();

    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { redirectUrl: { contains: search, mode: 'insensitive' } },
        { targetType: { contains: search, mode: 'insensitive' } },
        { targetId: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private assertImageUrl(value: string) {
    const path = value.trim().split('?')[0].toLowerCase();
    if (!imageExtensions.some((extension) => path.endsWith(extension))) {
      throw new BadRequestException(
        'Banner image must be a jpg, png, webp, gif, or avif URL',
      );
    }
  }

  private normalizeText(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private cleanOptional(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
