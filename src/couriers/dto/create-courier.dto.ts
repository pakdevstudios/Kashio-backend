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
  @IsString()
  @IsNotEmpty()
  pickupName: string;

  @IsString()
  @IsNotEmpty()
  pickupContact: string;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsOptional()
  @IsNumber()
  pickupLat?: number;

  @IsOptional()
  @IsNumber()
  pickupLng?: number;

  // Drop-off
  @IsString()
  @IsNotEmpty()
  dropName: string;

  @IsString()
  @IsNotEmpty()
  dropContact: string;

  @IsString()
  @IsNotEmpty()
  dropAddress: string;

  @IsOptional()
  @IsNumber()
  dropLat?: number;

  @IsOptional()
  @IsNumber()
  dropLng?: number;
}
