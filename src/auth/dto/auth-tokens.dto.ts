import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

// Google profile saved directly (MVP: no server-side idToken verification yet).
// The mobile app already has these fields from `google_sign_in`.
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  googleId: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
