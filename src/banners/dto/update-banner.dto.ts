import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  redirectUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBannerStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class UpdateBannerOrderDto {
  @IsInt()
  @Min(0)
  displayOrder: number;
}
