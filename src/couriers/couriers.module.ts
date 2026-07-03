import { Module } from '@nestjs/common';
import { CouriersService } from './couriers.service';
import { CouriersController } from './couriers.controller';
import { AddressesModule } from '../addresses/addresses.module';

@Module({
  imports: [AddressesModule],
  controllers: [CouriersController],
  providers: [CouriersService],
  exports: [CouriersService],
})
export class CouriersModule {}
