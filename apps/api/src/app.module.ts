import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppEnvSchema } from './common/env.validation';
import { serializeRequest, serializeResponse } from './common/log-serializers';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { WorkoutModule } from './workout/workout.module';
import { ProgressModule } from './progress/progress.module';
import { GoalsModule } from './goals/goals.module';
import { SharingModule } from './sharing/sharing.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (config) => AppEnvSchema.parse(config),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        autoLogging: { ignore: (req) => req.url === '/health' },
        // Sem isto o `pino-http` usa o serializador padrão, que grava `headers` inteiro —
        // `authorization` incluído — e a URL com query string. A partir desta issue o log não
        // fica mais só no `docker logs`: ele é enviado ao Loki e indexado lá. Ver
        // `common/log-serializers.ts`.
        serializers: { req: serializeRequest, res: serializeResponse },
      },
    }),
    // O limite global chaveia por IP fora do /mcp. Todo o tráfego da Anthropic
    // sai de 160.79.104.0/21 — uma faixa compartilhada por TODOS os usuários do
    // conector — então discovery, /oauth/register e /oauth/token de todo mundo
    // cairiam no mesmo balde de 100/min e devolveriam 429 em massa no dia em que
    // o conector ganhasse tração. As rotas de OAuth usam o named limiter abaixo,
    // e o discovery é isento (JSON estático, sem banco). Ver #170.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'oauth', ttl: 60_000, limit: 600 },
    ]),
    CommonModule,
    HealthModule,
    AuthModule,
    UsersModule,
    NutritionModule,
    WorkoutModule,
    ProgressModule,
    GoalsModule,
    SharingModule,
    McpModule,
  ],
})
export class AppModule {}
