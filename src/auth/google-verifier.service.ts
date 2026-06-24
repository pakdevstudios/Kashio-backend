import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

@Injectable()
export class GoogleVerifierService {
  private readonly logger = new Logger(GoogleVerifierService.name);
  private readonly clientId: string;
  private readonly client: OAuth2Client;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') || '';
    this.client = new OAuth2Client(this.clientId);
  }

  // Verify a Google ID token (JWT) coming from the mobile app and return the
  // trusted profile. Throws 401 on any verification failure.
  async verify(idToken: string): Promise<GoogleProfile> {
    if (!this.clientId) {
      this.logger.error('GOOGLE_CLIENT_ID is not configured');
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
    } catch (e) {
      this.logger.warn(`Google idToken verification failed: ${e}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException('Google token missing required claims');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name || payload.email,
      picture: payload.picture,
    };
  }
}
