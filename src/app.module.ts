import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RidersModule } from './riders/riders.module';
import { CouriersModule } from './couriers/couriers.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { BannersModule } from './banners/banners.module';
import { CartModule } from './cart/cart.module';
import { AddressesModule } from './addresses/addresses.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RidersModule,
    CouriersModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    BannersModule,
    CartModule,
    AddressesModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
