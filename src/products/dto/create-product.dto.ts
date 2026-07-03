import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductType, VariationSelectionType } from '@prisma/client';
import { ProductImageDto } from './product-image.dto';
import {
  FrequentlyBoughtItemDto,
  ProductVariationOptionDto,
} from './product-variation.dto';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  storeName?: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountedPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  variationLabel?: string;

  @IsOptional()
  @IsEnum(VariationSelectionType)
  variationSelectionType?: VariationSelectionType;

  @IsOptional()
  @IsBoolean()
  isVariationRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  minVariationSelections?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  maxVariationSelections?: number;

  @IsOptional()
  @IsBoolean()
  allowSpecialInstructions?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  specialInstructionsPlaceholder?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  specialInstructionsMaxLength?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariationOptionDto)
  variationOptions?: ProductVariationOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrequentlyBoughtItemDto)
  frequentlyBoughtItems?: FrequentlyBoughtItemDto[];
}
