import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BannersService } from './banners.service';
import { BannerQueryDto } from './dto/banner-query.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import {
  UpdateBannerDto,
  UpdateBannerOrderDto,
  UpdateBannerStatusDto,
} from './dto/update-banner.dto';

@Controller('banners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @Public()
  findPublic(@Query() query: BannerQueryDto) {
    return this.bannersService.findPublic(query);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  findManagement(@Query() query: BannerQueryDto) {
    return this.bannersService.findManagement(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.bannersService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  setActive(@Param('id') id: string, @Body() dto: UpdateBannerStatusDto) {
    return this.bannersService.setActive(id, dto.isActive);
  }

  @Patch(':id/order')
  @Roles(Role.ADMIN)
  setOrder(@Param('id') id: string, @Body() dto: UpdateBannerOrderDto) {
    return this.bannersService.setOrder(id, dto.displayOrder);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}
