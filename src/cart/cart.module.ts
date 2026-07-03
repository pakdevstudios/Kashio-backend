import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCartController } from './admin-cart.controller';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [PrismaModule],
  controllers: [CartController, AdminCartController],
  providers: [CartService],
})
export class CartModule {}
