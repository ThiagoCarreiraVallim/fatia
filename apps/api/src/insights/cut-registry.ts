/**
 * Os recortes permitidos — **nomeados**, fechados, um eixo cada.
 *
 * A decisão que este arquivo materializa é anterior à supressão: **não existe
 * construtor de filtro**. Recusar depois de compor o filtro é tarde, porque com
 * filtros compostos livremente dá para derivar a célula suprimida pela diferença
 * entre duas consultas que passaram. A academia escolhe entre recortes; não
 * monta o dela.
 *
 * Três consequências, todas de propósito:
 *
 * - **Um eixo por consulta.** Nunca "por horário E por modalidade" — a
 *   combinação é o que produz o "restou uma".
 * - **Nenhum atributo demográfico.** Sexo, idade e faixa etária não são eixos. O
 *   exemplo da #159 ("alunas, 30-35 anos, turno da manhã") deixa de ser
 *   formulável, não só de ser respondível.
 * - **Só engajamento.** Peso, medida, alimentação e meta corporal não são eixo,
 *   não são métrica e não são filtro. `no-body-data.spec.ts` transforma isso em
 *   invariante do CI.
 *
 * A #160 (painel pago) **não** cria caminho novo: os recortes dela entram neste
 * mesmo registro e passam pelo mesmo `suppress()`. Dois catálogos seriam duas
 * noções de anonimização no mesmo produto — e uma delas estaria errada sem
 * ninguém saber qual.
 */

/** Painéis que consomem o catálogo. `behavior` é o add-on pago da #160. */
export type Panel = 'retention' | 'behavior';

export interface CutSpec {
  /** O único eixo do recorte. */
  axis: string;
  /** O que a célula mede. */
  metric: string;
  /** Em que painéis o recorte aparece. Um recorte pode servir aos dois. */
  panels: readonly Panel[];
}

export const CUTS = {
  /** Sessões por semana — a série que mostra a academia esvaziando. */
  sessions_by_week: { axis: 'week', metric: 'sessions', panels: ['retention', 'behavior'] },
  /** Dias ativos por mês, somados sobre os participantes. */
  active_days_by_month: { axis: 'month', metric: 'active_days', panels: ['retention'] },
  /** Horários de pico. Faixa do dia no fuso de **quem treinou**, não do servidor. */
  sessions_by_hour_band: {
    axis: 'hour_band',
    metric: 'sessions',
    panels: ['retention', 'behavior'],
  },
  /** Quantos participantes em cada faixa de "dias desde o último treino". */
  members_by_recency: { axis: 'recency_band', metric: 'members', panels: ['retention'] },
  /** O sinal de evasão da #159: contagem por faixa de risco, jamais uma lista. */
  members_by_churn_risk: { axis: 'risk_band', metric: 'members', panels: ['retention'] },
  /** Aderência: sessões vinculadas a plano sobre o total. Quantidade, nunca conteúdo. */
  plan_adherence_by_month: { axis: 'month', metric: 'adherence_pct', panels: ['behavior'] },
  /** Retenção por coorte de entrada. O limiar vale para o **denominador** da coorte. */
  retention_by_cohort: { axis: 'cohort_month', metric: 'retained_pct', panels: ['behavior'] },
  /** Mix de modalidade por grupo muscular do que foi efetivamente treinado. */
  modality_mix: { axis: 'muscle_group', metric: 'sessions', panels: ['behavior'] },
} as const satisfies Record<string, CutSpec>;

/**
 * União literal derivada do mapa. É o que faz um recorte inventado não compilar:
 * o controller recebe `CutName`, não um objeto de filtro, e string fora do
 * catálogo morre no DTO antes de virar consulta.
 */
export type CutName = keyof typeof CUTS;

export const CUT_NAMES = Object.keys(CUTS) as CutName[];

/** O recorte serve a este painel? */
export function cutBelongsTo(cut: CutName, panel: Panel): boolean {
  return (CUTS[cut].panels as readonly Panel[]).includes(panel);
}

export function cutsOf(panel: Panel): CutName[] {
  return CUT_NAMES.filter((cut) => cutBelongsTo(cut, panel));
}

/**
 * Períodos, também **nomeados**.
 *
 * Um `from`/`to` livre é um construtor de filtro com outro nome: janela
 * arbitrária é o que permite estreitar até sobrar a semana em que uma pessoa só
 * treinou, e comparar duas janelas quase iguais para isolar quem entrou entre
 * elas. Três janelas fixas custam utilidade e fecham a porta.
 */
export const PERIODS = {
  last_30_days: 30,
  last_90_days: 90,
  last_12_months: 365,
} as const;

export type PeriodName = keyof typeof PERIODS;

export const PERIOD_NAMES = Object.keys(PERIODS) as PeriodName[];

/** Instante inicial da janela, contado para trás a partir de `now`. */
export function periodStart(period: PeriodName, now: Date): Date {
  return new Date(now.getTime() - PERIODS[period] * 86_400_000);
}
