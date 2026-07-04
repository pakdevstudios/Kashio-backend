import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AdminOrderCustomerDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  contact: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class AdminOrderAddressDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  addressLine: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  stateProvince: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsOptional()
  @IsString()
  deliveryInstructions?: string;
}

export class AdminOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  variationOptionId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;
}

export class CreateAdminOrderDto {
  @ValidateNested()
  @Type(() => AdminOrderCustomerDto)
  customer: AdminOrderCustomerDto;

  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  address: AdminOrderAddressDto;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AdminOrderItemDto)
  items: AdminOrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  pickupName?: string;

  @IsOptional()
  @IsString()
  pickupContact?: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;
}
