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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import {
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/update-category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @Public()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  setActive(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    return this.categoriesService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
