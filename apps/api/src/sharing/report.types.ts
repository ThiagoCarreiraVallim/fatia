import type { ChallengeKind, GroupRole, InviteOrigin } from '@fatia/db';

/**
 * O relatório do mês e as origens dos convites (#400, Pn-03, Pn-25, Ex-02).
 *
 * Todo número sai só de quem aceitou entrar nas estatísticas (`statsOptIn`),
 * inclusive no denominador, e cada célula segue o mínimo de 5 pessoas
 * (`AGGREGATION_POLICY.md`). `null` é "amostra pequena demais para mostrar",
 * nunca zero.
 */

/** Uma célula de série (semana, dia): suprimida nunca vira 0. */
export interface ReportCell {
  key: string;
  value: number | null;
  suppressed: boolean;
}

/** Um bloco de dias do gráfico "Sessões por semana": 1–7, 8–14, ..., 29–fim. */
export interface ReportWeek extends ReportCell {
  /** Quantos dias o bloco tem (o último pode ter menos de 7). */
  days: number;
}

export interface ReportChallengeRow {
  id: string;
  title: string;
  kind: ChallengeKind;
  /** Participantes com opt-in; `null` = menos de 5 de um lado. */
  participants: number | null;
  /** `running` enquanto não acabou; depois, quem pontuou até o fim. */
  finished: number | null | 'running';
  /** Check-ins revisados pela equipe; `null` = menos de 5 pessoas. */
  reviewed: number | null;
  /** Check-ins anulados; `null` = menos de 5 pessoas. */
  voided: number | null;
}

export interface MonthReport {
  /** O mês do relatório, `YYYY-MM`, no fuso da comunidade. */
  month: string;
  /** Os meses que dá para abrir (só fechados: os 12 anteriores ao atual), do mais novo. */
  months: string[];
  groupName: string;
  /** Quantos aceitaram entrar nas estatísticas; `null` = menos de 5. */
  optIn: number | null;
  riskDays: number;
  weeklySessionsGoal: number | null;
  activeMembers: {
    /** Treinaram ao menos uma vez no mês. */
    value: number | null;
    percent: number | null;
    /** Diferença em pontos para o mês anterior. */
    deltaPts: number | null;
    /** Diferença em pessoas para o mês anterior. */
    delta: number | null;
  };
  sessions: { total: number | null; perActive: number | null; deltaPct: number | null };
  /** Dias com treino, em média, por membro ativo (no lugar de "dias com o app aberto"). */
  trainingDays: { perActive: number | null; deltaPct: number | null };
  /** Voltaram a treinar depois de 14 dias ou mais sem treino. */
  returned: number | null;
  /** Sem treino há `riskDays` dias ou mais no fim do período (a regra do "Em risco"). */
  atRisk: number | null;
  plans: {
    sent: number | null;
    acceptedPercent: number | null;
    declined: number | null;
    noResponse: number | null;
  };
  reviews: {
    /** Treinos do mês que a equipe revisou (viu ou comentou). */
    reviewed: number | null;
    withinDayPercent: number | null;
    medianHours: number | null;
  };
  weeks: ReportWeek[];
  /** Média dos blocos de 7 dias publicados; o bloco curto do fim fica fora. */
  weeksAverage: number | null;
  /** Blocos de 7 dias que bateram a meta, dos publicados. */
  weeksOnGoal: { hit: number; of: number } | null;
  /**
   * Membros ativos acumulados no mês, no último dia de cada bloco de 7 dias
   * (por semana, não por dia: um dia a mais isolaria a 1ª vez de uma pessoa).
   */
  activeByDay: ReportCell[];
  challenges: ReportChallengeRow[];
  /** "Quem participa de algum desafio registra 2,1× mais dias". */
  challengeLift: number | null;
}

export type OriginsDays = 7 | 30;
/** `other`: "Outras origens", a soma das linhas com menos de 5 pessoas, sem rótulo. */
export type OriginKindLabel = 'qr' | 'link' | 'list' | 'email' | 'code' | 'other';

export interface OriginRow {
  key: string;
  origin: InviteOrigin | null;
  label: string | null;
  kind: OriginKindLabel;
  /** Entraram (opt-in) no período; `null` = suprimido (diferença com o outro período). */
  joined: number | null;
  /** Ativaram em 48 h; `null` = menos de 5 de um lado. */
  activated: number | null;
  percent: number | null;
}

export interface InviteOrigins {
  days: OriginsDays;
  /** Soma dos que entraram por link ou QR com nome; `null` = não sai. */
  joined: number | null;
  activated: number | null;
  percent: number | null;
  rows: OriginRow[];
}

export interface ReportTeamMember {
  membershipId: string;
  name: string;
  role: GroupRole;
  /** O dono recebe sempre; a equipe, se o dono marcou. */
  reportEmail: boolean;
}

export interface ReportSettings {
  weeklySessionsGoal: number | null;
  reportEmailEnabled: boolean;
  /** O servidor manda e-mail (SMTP e segredo do descadastro configurados). */
  emailAvailable: boolean;
  team: ReportTeamMember[];
}

/** O que fica gravado do mês fechado: o resto (nome, meta, meses) é lido na hora. */
export type FrozenMonthReport = Omit<
  MonthReport,
  'months' | 'groupName' | 'weeklySessionsGoal' | 'weeksOnGoal'
>;
