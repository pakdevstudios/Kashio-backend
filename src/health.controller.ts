import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

// Public health check (used by Vercel/Render). No auth required.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'kashio-backend',
      time: new Date().toISOString(),
    };
  }

  // Diagnostic: actually hit the DB and surface the real error (temporary).
  @Get('db')
  async db() {
    try {
      const r = await this.prisma.$queryRaw`SELECT 1 as ok`;
      return { db: 'ok', result: r };
    } catch (e: any) {
      return {
        db: 'error',
        message: String(e?.message ?? e),
        code: e?.code,
        name: e?.name,
      };
    }
  }
}
