import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  removeItem(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.cartService.clear(user.id);
  }
}
