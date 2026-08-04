import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppEnvSchema } from './common/env.validation';
import { opcoesDoPinoHttp } from './common/logging';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { WorkoutModule } from './workout/workout.module';
import { ProgressModule } from './progress/progress.module';
import { GoalsModule } from './goals/goals.module';
import { SharingModule } from './sharing/sharing.module';
import { BillingModule } from './billing/billing.module';
import { InsightsModule } from './insights/insights.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (config) => AppEnvSchema.parse(config),
    }),
    // A configuração mora em `common/logging.ts`, e não inline aqui, porque ela
    // existe por privacidade e precisa de teste: os serializadores por lista de
    // permissão (#215 — `authorization` ia em texto puro para o log) e a máscara
    // do código de barras escaneado (#140), que não pode sair na mesma linha que
    // o cookie de sessão de quem escaneou. Ler a configuração e acreditar nela
    // foi o que deixou os dois vazamentos passarem; agora ela é exercitada.
    LoggerModule.forRoot({ pinoHttp: opcoesDoPinoHttp(process.env.NODE_ENV) }),
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
    BillingModule,
    InsightsModule,
    McpModule,
  ],
})
export class AppModule {}
