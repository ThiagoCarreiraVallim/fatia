import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import { profileProblem, suggestGoals, type SuggestionProfile } from './goal-suggestion';
import { assertGoalsValid } from './user-goals.service';
import type { CompleteOnboardingDto, SuggestGoalsDto } from './dto/onboarding.dto';

const ONBOARDING_USER_SELECT = {
  sex: true,
  birthDate: true,
  heightCm: true,
  activityLevel: true,
  objective: true,
} as const;

const CAMPO_FALTANDO: Record<keyof SuggestionProfile, string> = {
  sex: 'sexo',
  birthDate: 'data de nascimento',
  heightCm: 'altura',
  weightKg: 'peso',
  activityLevel: 'nível de atividade',
  objective: 'objetivo',
};

/** `Date` de coluna `@db.Date` → YYYY-MM-DD, sem passar por fuso (vem à meia-noite UTC). */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Primeira vez no app: perfil → sugestão de metas → metas salvas.
 *
 * A sugestão também é servida avulsa (`POST /nutrition/goals/suggestion` e
 * `suggest_nutrition_goals`) para quem quer recalcular depois ou usa só o MCP.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(userId: string, input: SuggestGoalsDto, timezone: string) {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: ONBOARDING_USER_SELECT }),
      input.weightKg === undefined
        ? this.prisma.weightLog.findFirst({ where: { userId }, orderBy: { loggedAt: 'desc' } })
        : null,
    ]);
    const merged: Partial<SuggestionProfile> = {
      sex: input.sex ?? user?.sex ?? undefined,
      birthDate: input.birthDate ?? (user?.birthDate ? isoDay(user.birthDate) : undefined),
      heightCm: input.heightCm ?? user?.heightCm ?? undefined,
      weightKg: input.weightKg ?? latest?.weightKg ?? undefined,
      activityLevel: input.activityLevel ?? user?.activityLevel ?? undefined,
      objective: input.objective ?? user?.objective ?? undefined,
    };
    const faltam = (Object.keys(CAMPO_FALTANDO) as (keyof SuggestionProfile)[])
      .filter((k) => merged[k] === undefined)
      .map((k) => CAMPO_FALTANDO[k]);
    if (faltam.length > 0) {
      throw new BadRequestException(`Faltam dados para calcular: ${faltam.join(', ')}.`);
    }
    return this.calcular(merged as SuggestionProfile, timezone);
  }

  async complete(userId: string, dto: CompleteOnboardingDto, timezone: string) {
    const { goals, weightKg, ...perfil } = dto;
    this.calcular({ ...perfil, weightKg }, timezone); // mesmas faixas da sugestão
    assertGoalsValid(goals);

    const { start, end } = dayBoundsInTz(todayInTz(timezone), timezone);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...perfil,
          birthDate: new Date(`${perfil.birthDate}T00:00:00Z`),
          onboardedAt: new Date(),
        },
        select: { id: true, onboardedAt: true },
      });
      // Peso de hoje igual ao informado não vira segunda pesagem.
      const mesmaDeHoje = await tx.weightLog.findFirst({
        where: { userId, weightKg, loggedAt: { gte: start, lt: end } },
      });
      if (!mesmaDeHoje) {
        await tx.weightLog.create({ data: { userId, weightKg, loggedAt: new Date() } });
      }
      const saved = await tx.userGoals.upsert({
        where: { userId },
        create: { userId, ...goals },
        update: goals,
      });
      return { onboardedAt: user.onboardedAt, goals: saved };
    });
  }

  /** "Pular por agora": não pergunta de novo, e as metas ficam como estão. */
  async skip(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    return this.prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } });
  }

  private calcular(profile: SuggestionProfile, timezone: string) {
    const today = todayInTz(timezone);
    const problema = profileProblem(profile, today);
    if (problema) throw new BadRequestException(problema);
    return suggestGoals(profile, today);
  }
}
