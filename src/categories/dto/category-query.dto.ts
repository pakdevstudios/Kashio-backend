import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CategoryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['name', 'createdAt'])
  sortBy?: 'name' | 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
