import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/auth-tokens.dto';
import { TokenService } from './token.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private tokens: TokenService,
  ) {}

  // --- Email + password (admin / rider) ----------------------------------
  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { rider: { select: { id: true } } },
    });

    if (!user || !user.isActive || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const pair = await this.tokens.issuePair(user, userAgent);
    return this.authResponse(pair, user, user.rider?.id ?? null);
  }

  // --- Google sign-in (customer / mobile) --------------------------------
  // MVP: the app posts the Google profile and we save it directly. To harden
  // later, verify a Google idToken first (see GoogleVerifierService) and feed
  // its trusted payload into this same upsert.
  async googleLogin(dto: GoogleLoginDto, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();

    // Match an existing account by googleId first, then by email (so a user
    // who previously existed by email gets linked rather than duplicated).
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: dto.googleId }, { email }] },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name,
          avatarUrl: dto.avatarUrl,
          googleId: dto.googleId,
          provider: AuthProvider.GOOGLE,
          role: Role.CUSTOMER,
        },
      });
    } else {
      // Link/refresh Google profile data on the existing account.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId ?? dto.googleId,
          name: user.name || dto.name,
          avatarUrl: dto.avatarUrl ?? user.avatarUrl,
        },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const pair = await this.tokens.issuePair(user, userAgent);
    return this.authResponse(pair, user, null);
  }

  // --- Refresh (silent re-login) -----------------------------------------
  async refresh(refreshToken: string, userAgent?: string) {
    const pair = await this.tokens.rotate(refreshToken, userAgent);
    return { token: pair.token, refresh_token: pair.refreshToken };
  }

  // --- Logout -------------------------------------------------------------
  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }

  // --- Profile ------------------------------------------------------------
  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      include: { rider: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return this.userView(user, user.rider?.id ?? null);
  }

  // --- shared shapes ------------------------------------------------------
  private authResponse(
    pair: { token: string; refreshToken: string },
    user: User,
    riderId: string | null,
  ) {
    return {
      token: pair.token,
      refresh_token: pair.refreshToken,
      user: this.userView(user, riderId),
    };
  }

  // snake_case to match the mobile UserModel parser.
  private userView(user: User, riderId: string | null) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar_url: user.avatarUrl,
      is_premium: user.isPremium,
      role: user.role,
      rider_id: riderId,
      created_at: user.createdAt,
    };
  }
}
