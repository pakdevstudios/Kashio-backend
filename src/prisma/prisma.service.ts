import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Connect in the background; Prisma also connects lazily on first query.
    // Not awaiting here keeps serverless cold-starts from failing app bootstrap
    // (e.g. a slow DB wake) — health checks stay up, queries connect on demand.
    this.$connect().catch(() => {
      /* first query will retry the connection */
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
