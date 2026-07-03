import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,19}$/;

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryInstructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
