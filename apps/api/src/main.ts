import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:3030');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api', {
    exclude: [
      '/health',
      '/mcp',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-authorization-server',
      '/oauth/register',
      '/oauth/authorize',
      '/oauth/callback',
      '/oauth/token',
    ],
  });

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`API running on port ${port} [${nodeEnv}]`, 'Bootstrap');
}

bootstrap();
