import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  token: string; // short-lived access JWT
  refreshToken: string; // opaque, returned to client once (plaintext)
}

@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // Issue a fresh access + refresh pair for a user.
  async issuePair(user: User, userAgent?: string): Promise<TokenPair> {
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get('JWT_SECRET') || 'dev-secret-change-me',
        expiresIn: this.config.get('ACCESS_TOKEN_EXPIRES_IN') || '15m',
      },
    );

    const refreshToken = await this.createRefreshToken(user.id, userAgent);
    return { token, refreshToken };
  }

  // Validate + rotate a refresh token: the old one is revoked, a new pair issued.
  async rotate(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = this.hash(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!record.user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Revoke the consumed token (rotation) then issue a new pair.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair(record.user, userAgent);
  }

  // Revoke a single refresh token (logout on this device).
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Revoke every active refresh token for a user (logout everywhere).
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(
    userId: string,
    userAgent?: string,
  ): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS')) || 60;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        userAgent,
        expiresAt,
      },
    });
    return raw;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
