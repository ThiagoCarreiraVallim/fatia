import { BadRequestException, Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, type ActivityLevel } from '@prisma/client';
import type { BiologicalSex, BodyObjective } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { dateInTz, dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import { nutritionGoalsSchema, type NutritionGoals } from '../sharing/nutrition-snapshot';
import { profileUpdateData } from '../users/profile-update';
import { profileProblem, suggestGoals, type SuggestionProfile } from './goal-suggestion';
import { assertGoalsValid, upsertWithHistory } from './user-goals.service';
import {
  GOAL_SOURCES,
  ONBOARDING_STEPS,
  type CompleteOnboardingDto,
  type GoalSource,
  type OnboardingStep,
  type SaveOnboardingDto,
  type SuggestGoalsDto,
} from './dto/onboarding.dto';
import type { UpsertGoalsDto } from './dto/goals.dto';
import { snapshotGoalRanges } from '../sharing/nutrition-document';

const ONBOARDING_USER_SELECT = {
  sex: true,
  birthDate: true,
  heightCm: true,
  activityLevel: true,
  objective: true,
} as const;

const MISSING_FIELD_LABEL: Record<keyof SuggestionProfile, string> = {
  sex: 'sexo',
  birthDate: 'data de nascimento',
  heightCm: 'altura',
  weightKg: 'peso',
  activityLevel: 'nível de atividade',
  objective: 'objetivo',
};

/** `Date` de coluna `@db.Date` → YYYY-MM-DD, sem passar por fuso (vem à meia-noite UTC). */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** O que fica no `User.onboardingDraft` até a conclusão. */
interface OnboardingDraft {
  weightKg?: number;
  goals?: UpsertGoalsDto;
  goalSource?: GoalSource;
}

/** A retomada (#371): onde a pessoa parou e o que já respondeu. */
export interface OnboardingProgress {
  step: OnboardingStep | null;
  onboardedAt: Date | null;
  profile: {
    objective: BodyObjective | null;
    sex: BiologicalSex | null;
    birthDate: string | null;
    heightCm: number | null;
    activityLevel: ActivityLevel | null;
    /** O do rascunho, ou a última pesagem. */
    weightKg: number | null;
  };
  draft: Pick<OnboardingDraft, 'goals' | 'goalSource'>;
  /** Meta do plano de nutrição publicado pela equipe (prancha Onb-07b). */
  teamSuggestion: TeamGoalSuggestion | null;
}

export interface TeamGoalSuggestion {
  groupId: string;
  groupName: string;
  authorName: string | null;
  goals: NutritionGoals;
}

export type FirstStepKey = 'meal' | 'workout' | 'challenge' | 'community';

export interface FirstStep {
  key: FirstStepKey;
  title: string;
  subtitle: string;
  href: string;
  done: boolean;
}

/** O cartão "Primeiros passos" do Hoje (prancha Onb-11). */
export interface FirstStepsView {
  items: FirstStep[];
  doneCount: number;
  allDone: boolean;
  /** Some no dia seguinte ao de tudo pronto, no fuso da pessoa. */
  visible: boolean;
}

const isStep = (v: unknown): v is OnboardingStep =>
  typeof v === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(v);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** O rascunho vem do banco como JSON livre: só passa o que tem o formato certo. */
function readDraft(raw: Prisma.JsonValue | null): OnboardingDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const draft: OnboardingDraft = {};
  if (isNumber(r.weightKg)) draft.weightKg = r.weightKg;
  if (r.goals && typeof r.goals === 'object' && !Array.isArray(r.goals)) {
    const g = r.goals as Record<string, unknown>;
    const required = [
      'kcalMin',
      'kcalMax',
      'proteinMinG',
      'proteinMaxG',
      'carbsMinG',
      'carbsMaxG',
      'fatMinG',
      'fatMaxG',
    ];
    if (required.every((k) => isNumber(g[k]))) draft.goals = g as unknown as UpsertGoalsDto;
  }
  if ((GOAL_SOURCES as readonly unknown[]).includes(r.goalSource)) {
    draft.goalSource = r.goalSource as GoalSource;
  }
  return draft;
}

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

/**
 * Primeira vez no app: perfil → sugestão de metas → metas salvas, e a retomada
 * de onde parou (#371).
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
    const missing = (Object.keys(MISSING_FIELD_LABEL) as (keyof SuggestionProfile)[])
      .filter((k) => merged[k] === undefined)
      .map((k) => MISSING_FIELD_LABEL[k]);
    if (missing.length > 0) {
      throw new BadRequestException(`Faltam dados para calcular: ${missing.join(', ')}.`);
    }
    return this.calculate(merged as SuggestionProfile, timezone);
  }

  async complete(userId: string, dto: CompleteOnboardingDto, timezone: string) {
    const { goals, weightKg, ...profile } = dto;
    this.calculate({ ...profile, weightKg }, timezone); // mesmas faixas da sugestão
    assertGoalsValid(goals);

    const { start, end } = dayBoundsInTz(todayInTz(timezone), timezone);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...profile,
          birthDate: new Date(`${profile.birthDate}T00:00:00Z`),
          onboardedAt: new Date(),
          // Peso e metas agora moram na pesagem e nas metas; a etapa segue,
          // porque lembretes, notificações e IA ainda vêm depois.
          onboardingDraft: Prisma.DbNull,
        },
        select: { id: true, onboardedAt: true },
      });
      // Peso de hoje igual ao informado não vira segunda pesagem.
      const sameToday = await tx.weightLog.findFirst({
        where: { userId, weightKg, loggedAt: { gte: start, lt: end } },
      });
      if (!sameToday) {
        await tx.weightLog.create({ data: { userId, weightKg, loggedAt: new Date() } });
      }
      // Refazer o onboarding com metas novas guarda as de antes (#396).
      const { goals: saved } = await upsertWithHistory(tx, userId, goals, { source: 'manual' });
      return { onboardedAt: user.onboardedAt, goals: saved };
    });
  }

  /** "Pular por agora": não pergunta de novo, e as metas ficam como estão. */
  async skip(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingStep: null, onboardingDraft: Prisma.DbNull },
    });
    return this.prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } });
  }

  /** Onde a pessoa parou, já preenchido (prancha Onb-Retomada). */
  async getProgress(userId: string): Promise<OnboardingProgress> {
    const [user, latest, teamSuggestion] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          ...ONBOARDING_USER_SELECT,
          onboardedAt: true,
          onboardingStep: true,
          onboardingDraft: true,
        },
      }),
      this.prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        select: { weightKg: true },
      }),
      this.teamSuggestion(userId),
    ]);
    const { weightKg, ...draft } = readDraft(user.onboardingDraft);
    return {
      step: isStep(user.onboardingStep) ? user.onboardingStep : null,
      onboardedAt: user.onboardedAt,
      profile: {
        objective: user.objective,
        sex: user.sex,
        birthDate: user.birthDate ? isoDay(user.birthDate) : null,
        heightCm: user.heightCm,
        activityLevel: user.activityLevel,
        weightKg: weightKg ?? latest?.weightKg ?? null,
      },
      draft,
      teamSuggestion,
    };
  }

  /**
   * Salva um passo. O que tem coluna vai para o perfil (e vale para a sugestão
   * avulsa e o `get_me`); peso e metas ficam no rascunho.
   */
  async saveProgress(
    userId: string,
    dto: SaveOnboardingDto,
    timezone: string,
  ): Promise<OnboardingProgress> {
    const { step, weightKg, goals, goalSource, ...profile } = dto;
    if (goals) assertGoalsValid(goals);
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardingDraft: true },
    });
    const draft: OnboardingDraft = {
      ...readDraft(current.onboardingDraft),
      ...(weightKg !== undefined ? { weightKg } : {}),
      ...(goals ? { goals } : {}),
      ...(goalSource ? { goalSource } : {}),
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...profileUpdateData(profile, timezone),
        onboardingStep: step,
        onboardingDraft: draft as Prisma.InputJsonObject,
      },
    });
    return this.getProgress(userId);
  }

  /**
   * Fim do onboarding (depois da IA ou do último "Pular"): sai da retomada e
   * liga o cartão "Primeiros passos" do Hoje. Refazer o onboarding não liga o
   * cartão de novo.
   */
  async finish(userId: string): Promise<{ onboardedAt: Date; firstStepsSince: Date }> {
    const now = new Date();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardedAt: true, firstStepsSince: true },
    });
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStep: null,
        onboardingDraft: Prisma.DbNull,
        onboardedAt: user.onboardedAt ?? now,
        firstStepsSince: user.firstStepsSince ?? now,
      },
      select: { onboardedAt: true, firstStepsSince: true },
    }) as Promise<{ onboardedAt: Date; firstStepsSince: Date }>;
  }

  /**
   * O cartão "Primeiros passos" (prancha Onb-11): 1ª refeição, o treino da
   * equipe (ou um treino) e o desafio ativo (ou entrar numa comunidade). Cada
   * item vale pelo que de fato aconteceu, não por um toque no cartão.
   */
  async firstSteps(
    userId: string,
    timezone: string,
    now: Date = new Date(),
  ): Promise<FirstStepsView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstStepsSince: true, firstStepsDoneAt: true },
    });
    if (!user?.firstStepsSince) return null;

    const membership = await this.prisma.groupMembership.findFirst({
      where: { userId, status: MembershipStatus.ACTIVE, role: 'MEMBER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, groupId: true },
    });
    const [meal, workout, third] = await Promise.all([
      this.mealStep(userId),
      this.workoutStep(userId, membership?.groupId ?? null),
      membership ? this.challengeStep(membership, now) : null,
    ]);
    const items = [meal, workout, third ?? (await this.communityStep(userId))];
    const doneCount = items.filter((i) => i.done).length;
    const allDone = doneCount === items.length;

    let doneAt = user.firstStepsDoneAt;
    if (allDone && !doneAt) {
      doneAt = now;
      await this.prisma.user.update({ where: { id: userId }, data: { firstStepsDoneAt: now } });
    }
    const visible = !doneAt || dateInTz(now, timezone) <= dateInTz(doneAt, timezone);
    return { items, doneCount, allDone, visible };
  }

  private async mealStep(userId: string): Promise<FirstStep> {
    const meals = await this.prisma.meal.count({ where: { userId } });
    return {
      key: 'meal',
      title: 'Registrar a 1ª refeição',
      subtitle: 'Por foto ou busca',
      href: '/nutrition',
      done: meals > 0,
    };
  }

  private async workoutStep(userId: string, groupId: string | null): Promise<FirstStep> {
    const template = groupId
      ? await this.prisma.groupPlanTemplate.findFirst({
          where: { groupId, kind: 'WORKOUT', publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          select: { id: true, title: true, author: { select: { name: true } } },
        })
      : null;
    const sessions = await this.prisma.workoutSession.count({ where: { userId } });
    if (!template || !groupId) {
      return {
        key: 'workout',
        title: 'Começar um treino',
        subtitle: 'Livre ou de um plano seu',
        href: '/workout',
        done: sessions > 0,
      };
    }
    const adopted = await this.prisma.workoutPlan.count({
      where: { userId, fromTemplateId: template.id },
    });
    const author = firstName(template.author?.name);
    return {
      key: 'workout',
      title: author ? `Abrir o treino de ${author}` : 'Abrir o treino da equipe',
      subtitle: template.title,
      href: `/community/${groupId}/content/${template.id}`,
      done: adopted > 0 || sessions > 0,
    };
  }

  private async challengeStep(
    membership: { id: string; groupId: string },
    now: Date,
  ): Promise<FirstStep | null> {
    const challenge = await this.prisma.groupChallenge.findFirst({
      where: {
        groupId: membership.groupId,
        startsAt: { lte: now },
        endsAt: { gt: now },
        endedEarlyAt: null,
      },
      orderBy: { startsAt: 'desc' },
      select: { id: true, title: true, _count: { select: { participants: true } } },
    });
    if (!challenge) return null;
    const joined = await this.prisma.groupChallengeParticipant.count({
      where: { membershipId: membership.id, challengeId: challenge.id },
    });
    const people = challenge._count.participants;
    return {
      key: 'challenge',
      title: 'Entrar no desafio',
      subtitle: `${challenge.title} · ${people} ${people === 1 ? 'pessoa' : 'pessoas'}`,
      href: `/community/${membership.groupId}/challenges/${challenge.id}`,
      done: joined > 0,
    };
  }

  private async communityStep(userId: string): Promise<FirstStep> {
    const memberships = await this.prisma.groupMembership.count({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    return {
      key: 'community',
      title: 'Entrar numa comunidade',
      subtitle: 'Com o código da academia ou do personal',
      href: '/community',
      done: memberships > 0,
    };
  }

  /**
   * A meta do plano de nutrição publicado mais recente de uma comunidade em
   * que a pessoa é membro ativo. Plano sem metas (só refeições) não conta.
   */
  private async teamSuggestion(userId: string): Promise<TeamGoalSuggestion | null> {
    const templates = await this.prisma.groupPlanTemplate.findMany({
      where: {
        kind: 'NUTRITION',
        publishedAt: { not: null },
        group: {
          memberships: { some: { userId, status: MembershipStatus.ACTIVE, role: 'MEMBER' } },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        snapshot: true,
        author: { select: { name: true } },
        group: { select: { id: true, name: true } },
      },
    });
    for (const t of templates) {
      // v1 (faixas) ou v2 do editor (#407, metas alvo): o mesmo que o adotar aplica.
      const goals = nutritionGoalsSchema.safeParse(snapshotGoalRanges(t.snapshot));
      if (goals.success) {
        return {
          groupId: t.group.id,
          groupName: t.group.name,
          authorName: t.author?.name ?? null,
          goals: goals.data,
        };
      }
    }
    return null;
  }

  private calculate(profile: SuggestionProfile, timezone: string) {
    const today = todayInTz(timezone);
    const problem = profileProblem(profile, today);
    if (problem) throw new BadRequestException(problem);
    return suggestGoals(profile, today);
  }
}
