import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';

// Builds the Nest app once per warm Lambda and reuses it across invocations.
// Used by the Vercel function in `api/index.js` (no app.listen on serverless).
let cachedApp: express.Express | null = null;

export async function bootstrapServer(): Promise<express.Express> {
  if (cachedApp) return cachedApp;

  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  app.setGlobalPrefix(process.env.API_PREFIX || 'v1');

  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  await app.init(); // initialise the app WITHOUT binding a port
  cachedApp = expressApp;
  return expressApp;
}
