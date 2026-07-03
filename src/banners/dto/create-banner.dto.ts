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

export class CreateBannerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetId?: string;

  @IsInt()
  @Min(0)
  displayOrder: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
