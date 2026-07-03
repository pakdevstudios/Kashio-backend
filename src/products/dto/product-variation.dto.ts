import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductVariationOptionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  minQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  maxQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;
}

export class FrequentlyBoughtItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  relatedProductId: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  minQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  maxQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
