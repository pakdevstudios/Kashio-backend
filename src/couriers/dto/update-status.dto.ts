import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CourierStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(CourierStatus)
  status: CourierStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelCourierDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
