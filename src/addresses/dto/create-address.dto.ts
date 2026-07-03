import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,19}$/;

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @MaxLength(30)
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  addressLine: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  stateProvince: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  country: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryInstructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
