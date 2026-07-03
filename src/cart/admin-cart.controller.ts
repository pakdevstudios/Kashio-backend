import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CartService } from './cart.service';
import { CartQueryDto } from './dto/cart-query.dto';

@Controller('cart/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findManagement(@Query() query: CartQueryDto) {
    return this.cartService.findManagement(query);
  }

  @Get(':id')
  findManagementOne(@Param('id') id: string) {
    return this.cartService.findManagementOne(id);
  }
}
