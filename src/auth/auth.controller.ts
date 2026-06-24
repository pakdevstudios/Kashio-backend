import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto, RefreshTokenDto } from './dto/auth-tokens.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /v1/auth/login — email + password (admin / rider)
  @Post('login')
  login(@Body() dto: LoginDto, @Headers('user-agent') ua?: string) {
    return this.authService.login(dto, ua);
  }

  // POST /v1/auth/google — save the Google profile + issue our tokens (customer)
  @Post('google')
  google(@Body() dto: GoogleLoginDto, @Headers('user-agent') ua?: string) {
    return this.authService.googleLogin(dto, ua);
  }

  // POST /v1/auth/refresh — rotate refresh token, get a fresh access token
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto, @Headers('user-agent') ua?: string) {
    return this.authService.refresh(dto.refreshToken, ua);
  }

  // POST /v1/auth/logout — revoke the refresh token on this device
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  // GET /v1/auth/me — current profile
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }
}
