import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdminOrderAddressDto } from './create-admin-order.dto';

/** Admin: open (or resume) a DRAFT order for a caller, keyed by contact/phone. */
export class CreateDraftOrderDto {
  @IsString()
  @IsNotEmpty()
  contact: string;

  @IsOptional()
  @IsString()
  name?: string;
}

/** Update the quantity of a line in a draft. */
export class UpdateDraftItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

/** Admin: finalize a draft into a placed order (enters the delivery pipeline). */
export class CheckoutDraftDto {
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  address: AdminOrderAddressDto;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  pickupName?: string;

  @IsOptional()
  @IsString()
  pickupContact?: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;
}
