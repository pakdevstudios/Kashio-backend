import { Controller, Get } from '@nestjs/common';

// Public health check (used by Render's healthCheckPath). No auth required.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'kashio-backend', time: new Date().toISOString() };
  }
}
