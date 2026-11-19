import type { GroupRole, NutritionPlanStatus, PlanSchedule, ShareScope } from '@fatia/db';

/**
 * A ficha da pessoa no painel (#402, Pn-05). O que é da equipe (planos que ela
 * mandou, anotações, agenda planejada) aparece sempre; o que é dado de saúde
 * vem só da categoria que a pessoa liberou para QUEM OLHA, e cada leitura entra
 * na trilha dela (`ProfessionalAccessLog`).
 */

/** Rascunho fica para os editores (#406, #407). */
export type MemberPlanStatus = 'PENDING' | 'DECLINED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export interface MemberWorkoutPlan {
  offerId: string;
  title: string;
  status: MemberPlanStatus;
  /** Uma versão nova espera o aceite enquanto a atual segue em uso. */
  updatePending: boolean;
  version: number;
  schedule: PlanSchedule;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  /** "semana 2 de 4": só datas do plano, não é dado de saúde. */
  weekNumber: number | null;
  /** Sessões feitas do plano: nulo sem Treino liberado para quem olha. */
  sessionsDone: number | null;
  /** Sessões da agenda do plano (calendário). */
  sessionsPlanned: number | null;
  authorName: string | null;
  /** Quem olha pode apagar (o autor ou o dono). */
  canRemove: boolean;
  sentAt: Date;
  note: string | null;
  sourceTemplateId: string | null;
  position: number | null;
}

export interface MemberNutritionPlan {
  id: string;
  /** "Plano alimentar de Helena · v2": o plano não tem nome próprio. */
  title: string;
  status: NutritionPlanStatus;
  version: number;
  kcalMin: number;
  kcalMax: number;
  authorName: string | null;
  sentAt: Date;
  acceptedAt: Date | null;
}

export interface MemberWeek {
  /** Treinos concluídos de segunda até hoje, e a meta da semana. */
  workouts: { done: number; target: number } | null;
  /** Últimos 7 dias, incluindo hoje. */
  nutrition: {
    kcalAvg: number | null;
    daysLogged: number;
    kcalMin: number | null;
    kcalMax: number | null;
    proteinMinG: number | null;
    proteinDays: number | null;
  } | null;
  body: { currentWeightKg: number | null; deltaKg: number; sinceDays: number } | null;
}

export interface MemberAccessEntry {
  at: Date;
  /** Nulo na linha de abertura da ficha. */
  scope: ShareScope | null;
  action: string;
  denied: boolean;
  /** Nulo quando a conta de quem olhou não existe mais. */
  professionalName: string | null;
  isMe: boolean;
}

export interface MemberNoteView {
  id: string;
  text: string;
  authorName: string | null;
  isMine: boolean;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberAgendaItem {
  kind: 'planned' | 'weighin';
  title: string;
  /** Treino: planejado, feito ou não feito (feito só com Treino liberado). */
  state: 'planned' | 'done' | 'missed' | 'today' | null;
  /** Peso da pesagem (só com Corpo liberado). */
  weightKg: number | null;
  planOrder: number | null;
}

export interface MemberAgenda {
  today: string;
  from: string;
  to: string;
  timezone: string;
  /** "feito" e "não feito" só aparecem com Treino liberado. */
  showsDone: boolean;
  /** Pesagens só aparecem com Corpo liberado. */
  showsWeighins: boolean;
  days: Array<{ date: string; items: MemberAgendaItem[] }>;
}

export interface MemberFile {
  membershipId: string;
  groupId: string;
  name: string;
  role: GroupRole;
  joinedAt: Date | null;
  timezone: string;
  /** O PRO desta pessoa é pago pela comunidade (assento ativo). */
  proByGroup: boolean;
  /** A equipe com vínculo ativo com a pessoa nesta comunidade. */
  followedBy: string[];
  /** O que a pessoa liberou para quem olha. Vazio = nada. */
  grantedToMe: ShareScope[];
  /** Quem olha pode mandar plano (tem vínculo e a pessoa é membro). */
  canSendPlans: boolean;
  canManagePlans: boolean;
  canWriteNotes: boolean;
  plans: {
    workout: MemberWorkoutPlan[];
    nutrition: MemberNutritionPlan[];
    /** A pessoa reordenou no app: a ordem da equipe não muda mais a lista dela. */
    reorderedBySubject: boolean;
  };
  week: MemberWeek;
  nextDays: MemberAgenda['days'];
  notes: MemberNoteView[];
  accessLog: MemberAccessEntry[];
}
