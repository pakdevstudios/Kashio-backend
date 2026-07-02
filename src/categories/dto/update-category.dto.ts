import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCategoryStatusDto {
  @IsBoolean()
  isActive: boolean;
}
