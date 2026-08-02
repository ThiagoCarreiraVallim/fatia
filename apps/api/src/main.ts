// PRIMEIRO import do processo, de propósito. A instrumentação automática do OpenTelemetry
// funciona trocando o export de `http`, `express` e `@nestjs/core` na hora do `require`; se
// qualquer um deles for carregado antes, o patch chega tarde e não sai span nenhum. Mover esta
// linha para baixo quebra o trace **em silêncio**, sem erro e sem teste vermelho.
import './observability/tracing';
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

  // ATENÇÃO: `exclude` casa a rota EXATA — não cobre sub-caminhos. Rota nova
  // que precise viver fora do prefixo tem de entrar aqui explicitamente, senão
  // sobe em `/api/...` e some do lugar onde o cliente procura. Já aconteceu com
  // `/.well-known/oauth-protected-resource/mcp`, que o WWW-Authenticate anuncia:
  // o cabeçalho apontava para uma URL que respondia 404.
  app.setGlobalPrefix('api', {
    exclude: [
      '/health',
      '/mcp',
      '/favicon.ico',
      '/.well-known/oauth-protected-resource',
      // Caminho path-específico da RFC 9728, para o recurso `/mcp`. É o que o
      // WWW-Authenticate do 401 anuncia como resource_metadata.
      '/.well-known/oauth-protected-resource/mcp',
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
