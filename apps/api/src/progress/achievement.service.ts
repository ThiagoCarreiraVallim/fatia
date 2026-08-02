import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { StreakService } from './streak.service';
import { weekStartInTz } from './helpers/date-tz';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementSnapshot,
  type AchievementUnlock,
} from './achievement-catalog';

interface UserCtx {
  userId: string;
  timezone: string;
}

export interface AchievementEntry {
  key: string;
  title: string;
  description: string;
  /** `null` = ainda bloqueada. O catálogo inteiro é devolvido sempre, para a tela mostrar o alvo. */
  unlockedAt: string | null;
  context: Prisma.JsonValue | null;
}

/** Memoiza a promessa, não o valor: duas conquistas que precisam do mesmo dado consultam uma vez. */
function umaVez<T>(fn: () => Promise<T>): () => Promise<T> {
  let pendente: Promise<T> | null = null;
  return () => (pendente ??= fn());
}

/**
 * Conquistas: avaliação **sob demanda e idempotente** (issue #147).
 *
 * `evaluate` é chamada pelo `POST /api/achievements/evaluate` e pela tool `refresh_achievements`,
 * que os dois apps disparam a cada abertura. A alternativa — disparar de dentro de
 * `MealService.create`, `SessionSetService.create` e afins — espalharia a regra por quatro
 * services, exigiria tocar em todos a cada conquista nova e nunca desbloquearia retroativamente
 * para quem já bateu o critério antes do deploy.
 *
 * O que ela **não** pode ser é efeito colateral de leitura: rodava dentro de
 * `DashboardService.today()`, e aí um `GET` gravava e a tool `get_today_summary`
 * (`readOnlyHint: true`) criava linhas sem que ninguém confirmasse nada.
 *
 * O `@@unique([userId, key])` é o que torna reavaliar barato e seguro: `createMany` com
 * `skipDuplicates` não duplica nem reescreve o `unlockedAt` de quem já tinha.
 *
 * Só o que **falta** é avaliado. É isso que segura o custo: as consultas caras (recorde pessoal,
 * semana completa) somem do caminho quente assim que a conquista correspondente é desbloqueada, e
 * no estado estável a avaliação é a única consulta que a tela já precisava fazer de qualquer jeito.
 */
@Injectable()
export class AchievementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streaks: StreakService,
  ) {}

  /** Só lê. Usada pelo endpoint e pela tool — não desbloqueia nada. */
  async list(ctx: UserCtx): Promise<AchievementEntry[]> {
    const desbloqueadas = await this.prisma.userAchievement.findMany({
      where: { userId: ctx.userId },
      select: { key: true, unlockedAt: true, context: true },
    });
    return this.montar(new Map(desbloqueadas.map((a) => [a.key, a])));
  }

  async evaluate(ctx: UserCtx): Promise<AchievementEntry[]> {
    const desbloqueadas = await this.prisma.userAchievement.findMany({
      where: { userId: ctx.userId },
      select: { key: true, unlockedAt: true, context: true },
    });
    const porChave = new Map(desbloqueadas.map((a) => [a.key, a]));

    const pendentes = ACHIEVEMENT_CATALOG.filter((d) => !porChave.has(d.key));
    if (pendentes.length === 0) return this.montar(porChave);

    const snapshot = this.snapshot(ctx);
    // Em paralelo: os critérios são independentes, e o `umaVez` faz duas conquistas que pedem o
    // mesmo dado compartilharem a MESMA promessa — então concorrência aqui não duplica consulta.
    // Sequencial, sete pendentes viravam sete idas ao banco enfileiradas na primeira avaliação.
    const avaliadas = await Promise.all(
      pendentes.map(async (def) => ({ key: def.key, unlock: await def.evaluate(snapshot) })),
    );
    const novas = avaliadas.filter(
      (r): r is { key: string; unlock: AchievementUnlock } => r.unlock !== null,
    );
    if (novas.length === 0) return this.montar(porChave);

    await this.prisma.userAchievement.createMany({
      data: novas.map(({ key, unlock }) => ({
        userId: ctx.userId,
        key,
        unlockedAt: unlock.unlockedAt,
        ...(unlock.context !== undefined && { context: unlock.context }),
      })),
      skipDuplicates: true,
    });

    for (const { key, unlock } of novas) {
      porChave.set(key, {
        key,
        unlockedAt: unlock.unlockedAt,
        context: (unlock.context ?? null) as Prisma.JsonValue,
      });
    }
    return this.montar(porChave);
  }

  private montar(
    porChave: Map<string, { unlockedAt: Date; context: Prisma.JsonValue | null }>,
  ): AchievementEntry[] {
    return ACHIEVEMENT_CATALOG.map((def) => {
      const linha = porChave.get(def.key);
      return {
        key: def.key,
        title: def.title,
        description: def.description,
        unlockedAt: linha ? linha.unlockedAt.toISOString() : null,
        context: linha?.context ?? null,
      };
    });
  }

  private snapshot(ctx: UserCtx): AchievementSnapshot {
    const { userId, timezone } = ctx;

    return {
      primeiraRefeicao: umaVez(async () => {
        const meal = await this.prisma.meal.findFirst({
          where: { userId },
          orderBy: { eatenAt: 'asc' },
          select: { eatenAt: true },
        });
        return meal?.eatenAt ?? null;
      }),

      primeiroTreino: umaVez(async () => {
        const session = await this.prisma.workoutSession.findFirst({
          where: { userId, completedAt: { not: null } },
          orderBy: { completedAt: 'asc' },
          select: { completedAt: true },
        });
        return session?.completedAt ?? null;
      }),

      primeiroPlano: umaVez(async () => {
        const plan = await this.prisma.workoutPlan.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        return plan?.createdAt ?? null;
      }),

      primeiroRecorde: umaVez(async () => {
        // Recorde é **superação**: a maior carga de um exercício ter vindo de uma sessão
        // posterior a alguma em que ele já havia sido treinado. Só ter carregado peso uma vez
        // não é recorde — seria a mesma coisa que `first_workout` com outro nome.
        //
        // O `groupBy` por (sessão, exercício) existe para não carregar todas as séries do
        // usuário como `SessionSetService.listPersonalRecords` faz: aqui basta o melhor de cada
        // exercício em cada sessão, e a série individual não interessa.
        const porSessao = await this.prisma.sessionSet.groupBy({
          by: ['sessionId', 'exerciseId'],
          where: { session: { userId }, weightKg: { not: null } },
          _max: { weightKg: true },
        });
        // Quem nunca levantou peso para aqui: sem série com carga não há recorde a superar, e
        // esta é a conquista que mais demora a desbloquear — sem o corte, as duas consultas
        // rodavam a cada avaliação, para sempre, para quem só registra refeição.
        if (porSessao.length === 0) return null;

        // Só as sessões que aparecem no `groupBy`. Buscar todas as do usuário trazia sessão sem
        // série e sessão de cardio para descartar em memória, e crescia para sempre.
        const sessoes = await this.prisma.workoutSession.findMany({
          where: { userId, id: { in: [...new Set(porSessao.map((l) => l.sessionId))] } },
          select: { id: true, startedAt: true },
        });

        const inicio = new Map(sessoes.map((s) => [s.id, s.startedAt]));
        const porExercicio = new Map<number, Array<{ at: Date; weightKg: number }>>();
        for (const linha of porSessao) {
          const at = inicio.get(linha.sessionId);
          const weightKg = linha._max.weightKg;
          if (!at || weightKg === null) continue;
          const lista = porExercicio.get(linha.exerciseId) ?? [];
          lista.push({ at, weightKg });
          porExercicio.set(linha.exerciseId, lista);
        }

        let melhor: { at: Date; exerciseId: number; weightKg: number } | null = null;
        for (const [exerciseId, lista] of porExercicio) {
          lista.sort((a, b) => a.at.getTime() - b.at.getTime());
          // O recorde a bater é o da primeira sessão; enquanto ninguém o supera ele não muda,
          // então a primeira carga maior que ele é a superação mais antiga daquele exercício.
          const aBater = lista[0].weightKg;
          const superacao = lista.slice(1).find((ponto) => ponto.weightKg > aBater);
          if (!superacao) continue;
          // A conquista é do PRIMEIRO recorde: entre os exercícios, vence a superação mais antiga.
          if (!melhor || superacao.at < melhor.at) {
            melhor = { at: superacao.at, exerciseId, weightKg: superacao.weightKg };
          }
        }
        if (!melhor) return null;

        const exercise = await this.prisma.exercise.findUnique({
          where: { id: melhor.exerciseId },
          select: { name: true },
        });
        return { ...melhor, exerciseName: exercise?.name ?? '' };
      }),

      primeiraSemanaCompleta: umaVez(async () => {
        const metas = await this.prisma.userGoals.findUnique({
          where: { userId },
          select: { weeklyWorkouts: true },
        });
        // Sem linha de `UserGoals` não há meta semanal declarada, e uma semana só é "completa"
        // contra uma meta. Inventar um alvo padrão desbloquearia a conquista por conta própria.
        if (!metas || metas.weeklyWorkouts <= 0) return null;

        const sessoes = await this.prisma.workoutSession.findMany({
          where: { userId, completedAt: { not: null } },
          select: { completedAt: true },
          orderBy: { completedAt: 'asc' },
        });

        const porSemana = new Map<string, number>();
        for (const s of sessoes) {
          if (!s.completedAt) continue;
          // A semana é a do fuso do usuário: o treino de domingo 22h em São Paulo é segunda em
          // UTC, e agrupar pelo instante bruto o jogaria para a semana seguinte.
          const semana = weekStartInTz(s.completedAt, timezone);
          const total = (porSemana.get(semana) ?? 0) + 1;
          porSemana.set(semana, total);
          if (total >= metas.weeklyWorkouts) {
            return { weekStart: semana, sessions: total, target: metas.weeklyWorkouts };
          }
        }
        return null;
      }),

      diasAtivosSeguidos: umaVez(async () => {
        // Preguiçoso como os demais: some do caminho assim que `streak_7` e `streak_30` estão
        // desbloqueadas, que é o estado estável de quem usa o app há um mês.
        const resumo = await this.streaks.compute(ctx);
        return resumo.activeDays.periodos;
      }),
    };
  }
}
