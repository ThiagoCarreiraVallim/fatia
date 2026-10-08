import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from '../../../common/common.module';
import type { McpToolContext, McpToolDef } from '../../../common/decorators/tool.decorator';
import { GoalsModule } from '../../../goals/goals.module';
import { NutritionModule } from '../../../nutrition/nutrition.module';
import { ProgressModule } from '../../../progress/progress.module';
import { SharingModule } from '../../../sharing/sharing.module';
import { WorkoutModule } from '../../../workout/workout.module';
import { IntentToolsModule } from '../../intent/intent-tools.module';

/**
 * Os módulos de domínio e o das tools de intenção, com a injeção de verdade: as tools de
 * entidade (as pernas) e as de intenção saem do mesmo container, sobre os mesmos services.
 */
export async function montarModuloDeTools(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
      CommonModule,
      NutritionModule,
      ProgressModule,
      WorkoutModule,
      GoalsModule,
      SharingModule,
      IntentToolsModule,
    ],
  }).compile();
}

export type Executar = (
  tool: abstract new (...args: never[]) => McpToolDef,
  input: Record<string, unknown>,
  ctx: McpToolContext,
) => Promise<unknown>;

/** Executa uma tool do container como o registry executaria: `execute(input, ctx)`. */
export function executor(modulo: TestingModule): Executar {
  return async (tool, input, ctx) =>
    modulo.get<McpToolDef>(tool, { strict: false }).execute(input as never, ctx);
}

/** Troca o que muda a cada seed (uuid, id, carimbo do banco) por marcadores estáveis. */
export function normalizar(valor: unknown): unknown {
  const marcas = new Map<string, string>();
  const marca = (bruto: unknown) => {
    const chave = String(bruto);
    if (!marcas.has(chave)) marcas.set(chave, `<id:${marcas.size + 1}>`);
    return marcas.get(chave);
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const andar = (v: unknown, chave?: string): unknown => {
    // `grantedAt` vem do relógio do banco, que o relógio fixo do Jest não alcança.
    if (chave && /^(createdAt|updatedAt|grantedAt)$/.test(chave)) return '<carimbo>';
    if (chave && /(^id$|Id$)/.test(chave) && v !== null && v !== undefined) return marca(v);
    if (typeof v === 'string' && uuid.test(v)) return marca(v);
    if (Array.isArray(v)) return v.map((x) => andar(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, andar(x, k)]));
    }
    return v;
  };
  return andar(JSON.parse(JSON.stringify(valor ?? null)));
}

/** Só o relógio de parede: o Prisma e o Jest continuam com timers de verdade. */
export function fixarRelogio(agora: Date): void {
  jest.useFakeTimers({
    now: agora,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}
