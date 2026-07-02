import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RidersModule } from './riders/riders.module';
import { CouriersModule } from './couriers/couriers.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RidersModule,
    CouriersModule,
    CategoriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
