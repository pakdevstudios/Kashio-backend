import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CourierStatus } from '@prisma/client';

export class CourierQueryDto {
  @IsOptional()
  @IsEnum(CourierStatus)
  status?: CourierStatus;

  @IsOptional()
  @IsString()
  riderId?: string;

  // free-text search over code / customer / address
  @IsOptional()
  @IsString()
  search?: string;
}
