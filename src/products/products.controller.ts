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
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findPublic(query);
  }

  @Get('search')
  @Public()
  search(@Query() query: ProductQueryDto) {
    return this.productsService.findPublic(query);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  findManagement(@Query() query: ProductQueryDto) {
    return this.productsService.findManagement(query);
  }

  @Get('management/list')
  @Roles(Role.ADMIN)
  findManagementList(@Query() query: ProductQueryDto) {
    return this.productsService.findManagement(query);
  }

  @Get(':idOrSlug')
  @Public()
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findPublicOne(idOrSlug);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch('supplier/assign')
  @Roles(Role.ADMIN)
  assignSupplier(@Body() dto: AssignProductsSupplierDto) {
    return this.productsService.assignSupplier(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.deactivate(id);
  }

  @Post(':id/images')
  @Roles(Role.ADMIN)
  addImage(@Param('id') id: string, @Body() dto: ProductImageDto) {
    return this.productsService.addImage(id, dto);
  }

  @Patch(':id/images/:imageId')
  @Roles(Role.ADMIN)
  updateImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.productsService.updateImage(id, imageId, dto);
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.ADMIN)
  deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.deleteImage(id, imageId);
  }

  @Patch(':id/pricing')
  @Roles(Role.ADMIN)
  updatePricing(@Param('id') id: string, @Body() dto: UpdateProductPricingDto) {
    return this.productsService.updatePricing(id, dto);
  }

  @Patch(':id/availability')
  @Roles(Role.ADMIN)
  updateAvailability(
    @Param('id') id: string,
    @Body() dto: UpdateProductAvailabilityDto,
  ) {
    return this.productsService.updateAvailability(id, dto);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN)
  updateStock(@Param('id') id: string, @Body() dto: UpdateProductStockDto) {
    return this.productsService.updateStock(id, dto);
  }
}
