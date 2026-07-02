import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
