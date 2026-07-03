import { IsIn, IsOptional, IsString } from 'class-validator';
import { SupplierStatus } from '@prisma/client';

export class SupplierQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(SupplierStatus))
  status?: SupplierStatus;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'status'])
  sortBy?: 'name' | 'createdAt' | 'status';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
