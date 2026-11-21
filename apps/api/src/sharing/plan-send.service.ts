import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  NutritionPlanStatus,
  PlanTemplateKind,
  ShareScope,
  type PlanOfferStatus,
  type PlanSchedule,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { assertDay } from '../common/dates';
import { NutritionPlanService } from '../nutrition/nutrition-plan.service';
import { NotificationService } from '../notifications/notification.service';
import { addDaysIso, todayInTz } from '../progress/helpers/date-tz';
import { requireContentRole } from './content-roles';
import type { SendPlansDto } from './dto/plan-send.dto';
import {
  buildNutritionSendInput,
  loadBaseFoods,
  readNutritionSnapshot,
  snapshotFoodIds,
  studentFactor,
} from './nutrition-document';
import { nutritionPlanSentNotice } from './plan-offer-notices';
import { PlanOfferService, resendTargetWhere } from './plan-offer.service';
import { offerState, type OfferVersionState } from './plan-offer-state';
import { offerProgress } from './plan-programs.service';
import { ProfessionalAccessService } from './professional-access.service';
import { accompaniedOnly } from './team-reach';

export interface SendRecipient {
  membershipId: string;
  name: string;
  /** "Acompanhados por mim" (#404). */
  accompaniedByMe: boolean;
  /** Tem plano desta comunidade esperando resposta ou em andamento. */
  hasPlan: boolean;
  /**
   * Já tem este modelo DE QUEM OLHA, e o envio vira versão nova com "o que
   * mudou" (o mesmo critério do envio: `resendTargetWhere`). O mesmo modelo
   * mandado por outra pessoa da equipe não conta: é envio novo.
   */
  alreadyHas: boolean;
  /**
   * Segue um plano flexível sem data de fim (fora o deste modelo de quem
   * olha): "depois do plano atual" não tem dia para começar.
   */
  openEnded: boolean;
}

export interface SendRecipientsView {
  recipients: SendRecipient[];
}

export interface SendResultItem {
  membershipId: string;
  /** Id da oferta de treino ou do plano alimentar. */
  id: string;
  version: number;
  /** `update`: versão nova de uma oferta que a pessoa já tinha. */
  kind: 'new' | 'update';
}

export interface SendResult {
  results: SendResultItem[];
}

export type SentStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED' | 'REVOKED' | 'ENDED';

export interface SentItem {
  id: string;
  kind: 'WORKOUT' | 'NUTRITION';
  title: string;
  version: number;
  changeNote: string | null;
  name: string;
  membershipId: string | null;
  sentAt: Date;
  status: SentStatus;
  schedule: PlanSchedule | null;
  startDate: string | null;
  endDate: string | null;
  /** Treinos feitos do plano, só com Treino liberado para quem olha. */
  progress: { done: number; planned: number | null; percent: number | null } | null;
  /** Aceito, mas sem Treino liberado: "sem progresso" (só o estado, nunca o motivo). */
  noProgress: boolean;
  /** Ainda sem resposta: dá para cancelar o envio. */
  canRevoke: boolean;
}

export interface SentList {
  items: SentItem[];
}

/** Quantos envios a lista "Enviados recentemente" mostra. */
const RECENT_LIMIT = 30;
const ACTION = 'sends.progress';
/** Leitura das kcal da pessoa para ajustar o plano alimentar (#407). */
const ADJUST = 'nutrition_plan_adjust';
const FORBIDDEN = 'Seu papel não envia planos para as pessoas';
const MEMBER_NOT_FOUND = 'Membership not found';
const SEND_NOT_FOUND = 'Send not found';
/** O que conta como plano atual: esperando resposta ou em andamento. */
const LIVE = new Set(['PENDING', 'ACTIVE', 'SCHEDULED']);

const STATUS_OF: Record<PlanOfferStatus, SentStatus> = {
  PENDING: 'SENT',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  SUPERSEDED: 'SUPERSEDED',
};

/**
 * Enviar para alunos (#405, Pn-18 e Pn-08b): um modelo da biblioteca para uma
 * ou várias pessoas, os envios recentes de quem envia e o cancelamento.
 *
 * Quem envia precisa de `member.plans` no papel (dono e profissional). Cada
 * pessoa do lote precisa ser membro ativo DESTA comunidade, dentro do recorte
 * "profissionais veem só quem acompanham" (#404), e ter `ProfessionalLink`
 * ativo com quem envia: um id que falhe barra o lote inteiro, sem envio pela
 * metade, e responde igual a inexistente.
 *
 * Treino vira `PlanOffer` (#379, ADR 014): a pessoa aceita e o aceite copia.
 * Plano alimentar vira `NutritionPlan` (#376, ADR 045). Enviar não lê dado de
 * saúde de ninguém (só as ofertas que a própria equipe mandou); o progresso em
 * "Enviados recentemente" é dado de Treino e passa pela porta de leitura,
 * com registro na trilha da pessoa.
 */
@Injectable()
export class PlanSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: PlanOfferService,
    private readonly nutritionPlans: NutritionPlanService,
    private readonly notifications: NotificationService,
    private readonly access: ProfessionalAccessService,
  ) {}

  // ---------------------------------------------------------------- para quem

  async recipients(
    viewerId: string,
    groupId: string,
    templateId?: string,
  ): Promise<SendRecipientsView> {
    await requireContentRole(this.prisma, viewerId, groupId, 'member.plans', FORBIDDEN);
    const tpl = templateId ? await this.findTemplate(groupId, templateId) : null;
    const pessoas = await this.linkedMembers(viewerId, groupId);
    const userIds = pessoas.map((p) => p.userId);
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: viewerId } },
      select: { id: true },
    });

    const nutricao = tpl?.kind === PlanTemplateKind.NUTRITION;
    const comPlano = new Set<string>();
    const jaTem = new Set<string>();
    let semFim = new Set<string>();
    if (nutricao) {
      const planos = await this.prisma.nutritionPlan.findMany({
        where: {
          groupId,
          userId: { in: userIds },
          status: { in: [NutritionPlanStatus.SENT, NutritionPlanStatus.ACCEPTED] },
        },
        select: { userId: true, authorId: true, sourceTemplateId: true },
      });
      for (const p of planos) {
        comPlano.add(p.userId);
        // O mesmo critério de `NutritionPlanService.sendFromTemplate`.
        if (tpl && p.sourceTemplateId === tpl.id && p.authorId === viewerId) jaTem.add(p.userId);
      }
    } else {
      for (const o of await this.liveOffers(groupId, userIds)) comPlano.add(o.userId);
      if (tpl) {
        const meus = await this.prisma.planOffer.findMany({
          where: {
            OR: userIds.map((id) => resendTargetWhere(id, groupId, viewerId, tpl.id)),
          },
          select: { userId: true },
        });
        for (const o of meus) jaTem.add(o.userId);
      }
      semFim = (await this.currentEnds(groupId, userIds, viewerId, tpl?.id ?? null)).openEnded;
    }

    return {
      recipients: pessoas
        .map((p) => ({
          membershipId: p.id,
          name: p.user.name,
          accompaniedByMe: Boolean(eu && p.accompaniedById === eu.id),
          hasPlan: comPlano.has(p.userId),
          alreadyHas: jaTem.has(p.userId),
          openEnded: semFim.has(p.userId),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    };
  }

  // ---------------------------------------------------------------- enviar

  async send(viewerId: string, groupId: string, input: SendPlansDto): Promise<SendResult> {
    await requireContentRole(this.prisma, viewerId, groupId, 'member.plans', FORBIDDEN);
    const tpl = await this.findTemplate(groupId, input.templateId);
    if (tpl.draft) throw new ConflictException('Termine o rascunho antes de enviar.');
    const alvos = await this.resolveRecipients(viewerId, groupId, input.membershipIds);
    const autor = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { id: true, name: true },
    });
    return tpl.kind === PlanTemplateKind.NUTRITION
      ? this.sendNutrition(autor, groupId, tpl, alvos, input)
      : this.sendWorkout(autor, groupId, tpl.id, alvos, input);
  }

  private async sendWorkout(
    autor: { id: string; name: string },
    groupId: string,
    templateId: string,
    alvos: Recipient[],
    input: SendPlansDto,
  ): Promise<SendResult> {
    const schedule = input.schedule ?? 'CALENDAR';
    const source = await this.offers.templateSource(groupId, templateId);
    // As datas de todo mundo antes de gravar a primeira: um 400 não deixa o
    // lote pela metade.
    const atuais = await this.currentEnds(
      groupId,
      alvos.map((a) => a.userId),
      autor.id,
      templateId,
    );
    const planos = alvos.map((a) => {
      const hoje = todayInTz(a.timezone);
      if (schedule === 'FLEXIBLE') {
        const endDate = input.endDate ? assertDay(input.endDate, 'endDate') : null;
        if (endDate && endDate < hoje) {
          throw new BadRequestException('O plano não pode terminar antes de hoje.');
        }
        return { alvo: a, startDate: undefined, endDate };
      }
      let startDate = hoje;
      if (input.start === 'DATE') {
        if (!input.startDate) throw new BadRequestException('Escolha o dia de começar.');
        startDate = assertDay(input.startDate, 'startDate');
        if (startDate < hoje) throw new BadRequestException('Escolha um dia de hoje em diante.');
      } else if (input.start === 'AFTER_CURRENT') {
        // Flexível sem fim não tem "depois" (revisão do PR #461): a tela tira a
        // opção para essa pessoa, e a API recusa em vez de começar hoje calada.
        if (atuais.openEnded.has(a.userId)) {
          throw new BadRequestException(
            `${a.name} segue um plano flexível sem data de fim: escolha o dia de começar.`,
          );
        }
        const fim = atuais.ends.get(a.userId);
        if (fim && fim >= hoje) startDate = addDaysIso(fim, 1);
      }
      return { alvo: a, startDate, endDate: null };
    });

    // O lote inteiro numa transação: ou todo mundo recebe, ou ninguém.
    const feitos = await this.offers.sendTemplateBatch(
      autor,
      groupId,
      templateId,
      source,
      planos.map((p) => ({
        userId: p.alvo.userId,
        input: {
          schedule,
          startDate: p.startDate,
          weeks: input.weeks,
          weekdays: input.weekdays,
          endDate: p.endDate,
          note: input.note,
          changeNote: input.changeNote,
        },
      })),
    );
    return {
      results: feitos.map((r, i) => ({
        membershipId: planos[i]!.alvo.membershipId,
        id: r.id,
        version: r.version,
        kind: r.kind,
      })),
    };
  }

  private async sendNutrition(
    autor: { id: string; name: string },
    groupId: string,
    tpl: { id: string; snapshot: unknown },
    alvos: Recipient[],
    input: SendPlansDto,
  ): Promise<SendResult> {
    const snap = readNutritionSnapshot(tpl.snapshot);
    const foods = await loadBaseFoods(this.prisma, snapshotFoodIds(snap));
    const fatores = await this.adjustFactors(autor.id, snap, alvos);
    // Monta o plano de cada pessoa antes de gravar: um 400 não deixa o lote pela metade.
    const planos = alvos.map((a) =>
      buildNutritionSendInput(snap, foods, {
        factor: fatores.get(a.userId) ?? 1,
        note: input.note,
      }),
    );
    // Uma transação para o lote; versão e "o que mudou" só do mesmo modelo.
    const feitos = await this.nutritionPlans.sendFromTemplate(
      autor.id,
      alvos.map((a) => a.membershipId),
      planos,
      { sourceTemplateId: tpl.id, changeNote: input.changeNote ?? null },
    );
    return {
      results: feitos.map(({ plan, update }, i) => {
        const a = alvos[i]!;
        this.notifications.notify(
          [a.userId],
          nutritionPlanSentNotice({ authorName: autor.name, update }),
        );
        return {
          membershipId: a.membershipId,
          id: plan.id,
          version: plan.version,
          kind: update ? ('update' as const) : ('new' as const),
        };
      }),
    };
  }

  /**
   * "Ajustar às metas de cada aluno" (#407): as kcal da pessoa são dado de
   * Alimentação. Só entram com a porta de leitura aberta para quem envia (a
   * leitura fica na trilha); sem ela, a pessoa recebe o plano como está.
   */
  private async adjustFactors(
    viewerId: string,
    snap: ReturnType<typeof readNutritionSnapshot>,
    alvos: Recipient[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!snap.adjustToStudent || !snap.targets) return out;
    for (const a of alvos) {
      try {
        await this.access.assertReadable(viewerId, a.membershipId, ShareScope.NUTRITION, ADJUST);
      } catch (err) {
        if (err instanceof NotFoundException) continue;
        throw err;
      }
      const metas = await this.prisma.userGoals.findUnique({
        where: { userId: a.userId },
        select: { kcalMin: true, kcalMax: true },
      });
      out.set(a.userId, studentFactor(snap, metas));
    }
    return out;
  }

  // ---------------------------------------------------------------- enviados

  async list(viewerId: string, groupId: string): Promise<SentList> {
    await requireContentRole(this.prisma, viewerId, groupId, 'member.plans', FORBIDDEN);
    const [ofertas, alimentares] = await Promise.all([
      this.prisma.planOffer.findMany({
        where: { groupId, authorId: viewerId },
        include: {
          user: { select: { name: true, timezone: true } },
          versions: { orderBy: { version: 'asc' } },
          plans: { select: { id: true, userId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: RECENT_LIMIT,
      }),
      this.prisma.nutritionPlan.findMany({
        where: { groupId, authorId: viewerId },
        include: {
          user: { select: { name: true } },
          sourceTemplate: { select: { title: true } },
        },
        orderBy: { sentAt: 'desc' },
        take: RECENT_LIMIT,
      }),
    ]);
    const userIds = [...new Set([...ofertas, ...alimentares].map((o) => o.userId))];
    const associacoes = await this.prisma.groupMembership.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { id: true, userId: true, status: true },
    });
    const assoc = new Map(associacoes.map((m) => [m.userId, m]));

    const items: SentItem[] = [];
    // Uma leitura de Treino por pessoa, não por oferta.
    const lerTreino = new Map<string, boolean>();
    for (const o of ofertas) {
      const latest = o.versions.at(-1);
      if (!latest) continue;
      const m = assoc.get(o.userId) ?? null;
      const hoje = todayInTz(o.user.timezone);
      const st = offerState(o.versions as OfferVersionState[], o.endedAt, hoje);
      const aceita = o.versions.some((v) => v.status === 'ACCEPTED');
      let status: SentStatus = STATUS_OF[latest.status];
      if (o.removedAt) status = 'REVOKED';
      else if (aceita && (o.endedAt || st?.status === 'ENDED')) status = 'ENDED';
      // A versão nova que caiu (terminada antes do aceite) não apaga a aceita.
      else if (aceita && latest.status === 'SUPERSEDED') status = 'ACCEPTED';

      let progress: SentItem['progress'] = null;
      let noProgress = false;
      const copias = o.plans.filter((p) => p.userId === o.userId).map((p) => p.id);
      if (aceita && !o.removedAt && copias.length && st) {
        let pode = false;
        if (m && m.status === MembershipStatus.ACTIVE) {
          if (!lerTreino.has(o.userId)) {
            lerTreino.set(o.userId, await this.canReadWorkout(viewerId, m.id));
          }
          pode = lerTreino.get(o.userId) === true;
        }
        if (pode) {
          const p = await offerProgress(this.prisma, o.userId, copias, st.shown, st.weekNumber);
          progress = { done: p.done, planned: p.planned, percent: p.percent };
        } else noProgress = true;
      }

      items.push({
        id: o.id,
        kind: 'WORKOUT',
        title: latest.title,
        version: latest.version,
        changeNote: latest.changeNote,
        name: o.user.name,
        membershipId: m?.id ?? null,
        sentAt: latest.sentAt,
        status,
        schedule: latest.schedule,
        startDate: latest.schedule === 'CALENDAR' ? latest.startDate : null,
        endDate: st?.endDate ?? null,
        progress,
        noProgress,
        canRevoke: !o.removedAt && !o.endedAt && !aceita && latest.status === 'PENDING',
      });
    }
    for (const p of alimentares) {
      items.push({
        id: p.id,
        kind: 'NUTRITION',
        title: p.sourceTemplate?.title ?? `Plano alimentar · ${p.kcalMin}–${p.kcalMax} kcal`,
        version: p.version,
        changeNote: p.changeNote,
        name: p.user.name,
        membershipId: assoc.get(p.userId)?.id ?? null,
        sentAt: p.sentAt,
        status:
          p.status === NutritionPlanStatus.SENT
            ? 'SENT'
            : p.status === NutritionPlanStatus.ACCEPTED
              ? 'ACCEPTED'
              : 'SUPERSEDED',
        schedule: null,
        startDate: null,
        endDate: null,
        progress: null,
        noProgress: false,
        canRevoke: p.status === NutritionPlanStatus.SENT,
      });
    }
    items.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return { items: items.slice(0, RECENT_LIMIT) };
  }

  // ---------------------------------------------------------------- cancelar

  /**
   * Cancela um envio que ainda espera resposta. É de quem enviou, ou do dono;
   * envio de outra pessoa da equipe, ou de outra comunidade, responde igual a
   * inexistente. O que já foi aceito sai pela ficha da pessoa (#402).
   */
  async revoke(
    viewerId: string,
    groupId: string,
    id: string,
  ): Promise<{ id: string; status: 'REVOKED' }> {
    const role = await requireContentRole(
      this.prisma,
      viewerId,
      groupId,
      'member.plans',
      FORBIDDEN,
    );
    const dono = role === GroupRole.OWNER;
    const oferta = await this.prisma.planOffer.findFirst({
      where: { id, groupId, removedAt: null, ...(dono ? {} : { authorId: viewerId }) },
      select: { id: true, endedAt: true },
    });
    if (oferta) {
      if (oferta.endedAt) throw new ConflictException('Esse plano já terminou.');
      await this.offers.revokePending(oferta.id);
      return { id, status: 'REVOKED' };
    }
    const plano = await this.prisma.nutritionPlan.findFirst({
      where: { id, groupId, ...(dono ? {} : { authorId: viewerId }) },
      select: { id: true },
    });
    if (!plano) throw new NotFoundException(SEND_NOT_FOUND);
    // Condicionado na própria escrita: o aceite no meio do caminho ganha.
    const r = await this.prisma.nutritionPlan.updateMany({
      where: { id: plano.id, status: NutritionPlanStatus.SENT },
      data: { status: NutritionPlanStatus.SUPERSEDED, supersededAt: new Date() },
    });
    if (r.count === 0) {
      throw new ConflictException('A pessoa já respondeu a este plano alimentar.');
    }
    return { id, status: 'REVOKED' };
  }

  // ---------------------------------------------------------------- apoio

  private async findTemplate(groupId: string, templateId: string) {
    const tpl = await this.prisma.groupPlanTemplate.findFirst({
      where: { id: templateId, groupId },
      select: { id: true, kind: true, draft: true, snapshot: true },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  /**
   * Quem pode receber de quem envia: membro ativo desta comunidade, com
   * vínculo ativo com ele aqui, dentro do recorte "só quem acompanham".
   */
  private async linkedMembers(viewerId: string, groupId: string) {
    const [links, meus] = await Promise.all([
      this.prisma.professionalLink.findMany({
        where: { professionalId: viewerId, groupId, revokedAt: null },
        select: { subjectUserId: true },
      }),
      accompaniedOnly(this.prisma, viewerId, groupId),
    ]);
    return this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        role: GroupRole.MEMBER,
        userId: { in: links.map((l) => l.subjectUserId) },
        ...(meus ? { id: { in: [...meus] } } : {}),
      },
      select: {
        id: true,
        userId: true,
        accompaniedById: true,
        user: { select: { name: true, timezone: true } },
      },
    });
  }

  /** Cada id do corpo amarrado a esta comunidade e ao vínculo; um que falhe barra todos. */
  private async resolveRecipients(
    viewerId: string,
    groupId: string,
    membershipIds: string[],
  ): Promise<Recipient[]> {
    const pedidos = [...new Set(membershipIds)];
    const pode = new Map((await this.linkedMembers(viewerId, groupId)).map((m) => [m.id, m]));
    const out: Recipient[] = [];
    for (const id of pedidos) {
      const m = pode.get(id);
      if (!m) throw new NotFoundException(MEMBER_NOT_FOUND);
      out.push({
        membershipId: m.id,
        userId: m.userId,
        timezone: m.user.timezone,
        name: m.user.name,
      });
    }
    return out;
  }

  /** Ofertas de treino vivas desta comunidade (esperando resposta ou em andamento). */
  private async liveOffers(groupId: string, userIds: string[]) {
    const ofertas = await this.prisma.planOffer.findMany({
      where: { groupId, userId: { in: userIds }, removedAt: null, endedAt: null },
      select: {
        userId: true,
        authorId: true,
        sourceTemplateId: true,
        user: { select: { timezone: true } },
        versions: { orderBy: { version: 'asc' } },
      },
    });
    return ofertas
      .map((o) => ({
        ...o,
        state: offerState(o.versions as OfferVersionState[], null, todayInTz(o.user.timezone)),
      }))
      .filter((o) => o.state && LIVE.has(o.state.status));
  }

  /**
   * "Depois do plano atual": o último dia do plano vivo de cada pessoa, nesta
   * comunidade, e quem segue um flexível sem fim. A oferta que este envio vai
   * transformar em versão nova (o mesmo modelo, do mesmo autor) não conta: a
   * versão nova a substitui (revisão do PR #461).
   */
  private async currentEnds(
    groupId: string,
    userIds: string[],
    authorId: string,
    templateId: string | null,
  ): Promise<{ ends: Map<string, string>; openEnded: Set<string> }> {
    const ends = new Map<string, string>();
    const openEnded = new Set<string>();
    for (const o of await this.liveOffers(groupId, userIds)) {
      if (templateId && o.authorId === authorId && o.sourceTemplateId === templateId) continue;
      const fim = o.state?.endDate;
      if (!fim) {
        if (o.state?.shown.schedule === 'FLEXIBLE') openEnded.add(o.userId);
        continue;
      }
      const atual = ends.get(o.userId);
      if (!atual || fim > atual) ends.set(o.userId, fim);
    }
    return { ends, openEnded };
  }

  private async canReadWorkout(viewerId: string, membershipId: string): Promise<boolean> {
    try {
      await this.access.assertReadable(viewerId, membershipId, ShareScope.WORKOUT, ACTION);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) return false;
      throw err;
    }
  }
}

interface Recipient {
  membershipId: string;
  userId: string;
  timezone: string;
  name: string;
}
