import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddCartAddOnDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  variationOptionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class AddCartVariationSelectionDto {
  @IsString()
  @IsNotEmpty()
  variationOptionId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  variationOptionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddCartVariationSelectionDto)
  variationSelections?: AddCartVariationSelectionDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddCartAddOnDto)
  addOns?: AddCartAddOnDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialInstructions?: string;
}
