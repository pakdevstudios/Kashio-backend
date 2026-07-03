import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { ParcelWeight } from '@prisma/client';

export class CreateCourierDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  categories: string[];

  @IsOptional()
  @IsEnum(ParcelWeight)
  weight?: ParcelWeight;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  // Pickup
  @IsOptional()
  @IsString()
  pickupAddressId?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.pickupAddressId)
  @IsString()
  @IsNotEmpty()
  pickupName?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.pickupAddressId)
  @IsString()
  @IsNotEmpty()
  pickupContact?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.pickupAddressId)
  @IsString()
  @IsNotEmpty()
  pickupAddress?: string;

  @IsOptional()
  @IsNumber()
  pickupLat?: number;

  @IsOptional()
  @IsNumber()
  pickupLng?: number;

  // Drop-off
  @IsOptional()
  @IsString()
  dropAddressId?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.dropAddressId)
  @IsString()
  @IsNotEmpty()
  dropName?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.dropAddressId)
  @IsString()
  @IsNotEmpty()
  dropContact?: string;

  @ValidateIf((dto: CreateCourierDto) => !dto.dropAddressId)
  @IsString()
  @IsNotEmpty()
  dropAddress?: string;

  @IsOptional()
  @IsNumber()
  dropLat?: number;

  @IsOptional()
  @IsNumber()
  dropLng?: number;
}
