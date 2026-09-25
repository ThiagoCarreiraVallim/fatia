import { TIPO_DA_REFEICAO } from '../../nutrition/mcp/list-meals.tool';

/**
 * Como cada argumento de uma escrita aparece para a pessoa no cartão de confirmação.
 *
 * Quem lê o cartão não é quem escreveu a tool: `mealType: LUNCH` e
 * `eatenAt: 2026-09-25T15:30:00Z` são verdade, mas não são informação para quem
 * vai decidir se grava. Aqui mora o português de cada campo, **num lugar só** —
 * `rotulos.spec.ts` reprova tool confirmável com campo que não esteja aqui, em
 * `OCULTOS` ou em `IDS`, para que uma tool nova não esconda um campo em silêncio.
 */

export interface ContextoDoFormato {
  timezone: string;
  agora: Date;
}

type Formato = (valor: unknown, ctx: ContextoDoFormato) => string | null;

export interface Campo {
  rotulo: string;
  formato?: Formato;
}

const numero = (valor: number, casas = 1) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });

const comUnidade =
  (unidade: string, casas = 1): Formato =>
  (valor) =>
    typeof valor === 'number' ? `${numero(valor, casas)} ${unidade}` : null;

const semUnidade: Formato = (valor) => (typeof valor === 'number' ? numero(valor) : null);

const texto: Formato = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

const deMapa =
  (mapa: Record<string, string>): Formato =>
  (valor) =>
    typeof valor === 'string' ? (mapa[valor] ?? mapa[valor.toLowerCase()] ?? valor) : null;

const listaDeMapa =
  (mapa: Record<string, string>): Formato =>
  (valor) =>
    Array.isArray(valor) && valor.length
      ? valor
          .map((item) => (typeof item === 'string' ? (mapa[item] ?? item) : String(item)))
          .join(', ')
      : null;

function diaNoFuso(data: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

function nomeDoDia(dia: string, ctx: ContextoDoFormato): string {
  const hoje = diaNoFuso(ctx.agora, ctx.timezone);
  const ontem = diaNoFuso(new Date(ctx.agora.getTime() - 86_400_000), ctx.timezone);
  const amanha = diaNoFuso(new Date(ctx.agora.getTime() + 86_400_000), ctx.timezone);
  if (dia === hoje) return 'hoje';
  if (dia === ontem) return 'ontem';
  if (dia === amanha) return 'amanhã';
  const [ano, mes, d] = dia.split('-').map(Number);
  const meio = new Date(Date.UTC(ano, mes - 1, d, 12));
  const mesmoAno = ano === Number(hoje.slice(0, 4));
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(mesmoAno ? {} : { year: 'numeric' }),
  })
    .format(meio)
    .replace('.', '');
}

/** "hoje, 12:30", "ontem, 08:00", "25 set, 19:15" — no fuso da pessoa. */
export const dataEHora: Formato = (valor, ctx) => {
  if (typeof valor !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return nomeDoDia(valor, ctx);
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: ctx.timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
  return `${nomeDoDia(diaNoFuso(data, ctx.timezone), ctx)}, ${hora}`;
};

/** Só o dia, para campo que é data e não momento ("date", "deadline"). */
export const dia: Formato = (valor, ctx) => {
  if (typeof valor !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return nomeDoDia(valor, ctx);
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : nomeDoDia(diaNoFuso(data, ctx.timezone), ctx);
};

const TIPO_DE_META: Record<string, string> = {
  weight: 'Peso',
  body_fat: '% de gordura',
  workout_frequency: 'Treinos por semana',
  step_count: 'Passos por dia',
  custom: 'Personalizada',
};

const SITUACAO_DA_META: Record<string, string> = {
  active: 'Ativa',
  completed: 'Concluída',
  expired: 'Expirada',
  archived: 'Arquivada',
};

const ORIGEM_DOS_PASSOS: Record<string, string> = {
  MANUAL: 'Anotado por você',
  GOOGLE_FIT: 'Google Fit',
  APPLE_HEALTH: 'Apple Saúde',
  HEALTH_CONNECT: 'Health Connect',
  STRAVA: 'Strava',
  GARMIN: 'Garmin',
  FITBIT: 'Fitbit',
  WEBHOOK: 'Integração',
};

const FOCO_DO_BLOCO: Record<string, string> = { strength: 'Força', hypertrophy: 'Hipertrofia' };
const NIVEL: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};
const MECANICA: Record<string, string> = { compound: 'Composto', isolation: 'Isolado' };
const EQUIPAMENTO: Record<string, string> = {
  barbell: 'Barra',
  dumbbell: 'Halteres',
  machine: 'Máquina',
  cable: 'Polia',
  'body only': 'Peso do corpo',
  kettlebells: 'Kettlebell',
  bands: 'Elástico',
  'medicine ball': 'Medicine ball',
  'exercise ball': 'Bola',
  'e-z curl bar': 'Barra W',
  'foam roll': 'Rolo',
  other: 'Outro',
};
const MUSCULOS: Record<string, string> = {
  abdominals: 'Abdômen',
  abductors: 'Abdutores',
  adductors: 'Adutores',
  biceps: 'Bíceps',
  calves: 'Panturrilhas',
  chest: 'Peito',
  forearms: 'Antebraços',
  glutes: 'Glúteos',
  hamstrings: 'Posteriores da coxa',
  lats: 'Dorsais',
  'lower back': 'Lombar',
  'middle back': 'Meio das costas',
  neck: 'Pescoço',
  quadriceps: 'Quadríceps',
  shoulders: 'Ombros',
  traps: 'Trapézio',
  triceps: 'Tríceps',
};

/** "America/Sao_Paulo" → "São Paulo": o nome do fuso é o da cidade, sem o continente. */
const fuso: Formato = (valor) => {
  if (typeof valor !== 'string' || !valor) return null;
  const cidade = valor.split('/').pop()?.replace(/_/g, ' ') ?? valor;
  return cidade === 'Sao Paulo' ? 'São Paulo' : cidade;
};

export const CAMPOS: Record<string, Campo> = {
  mealType: { rotulo: 'Refeição', formato: deMapa(TIPO_DA_REFEICAO) },
  eatenAt: { rotulo: 'Quando', formato: dataEHora },
  loggedAt: { rotulo: 'Quando', formato: dataEHora },
  startedAt: { rotulo: 'Início', formato: dataEHora },
  completedAt: { rotulo: 'Fim', formato: dataEHora },
  date: { rotulo: 'Dia', formato: dia },
  deadline: { rotulo: 'Prazo', formato: dia },
  notes: { rotulo: 'Observação', formato: texto },
  foodName: { rotulo: 'Alimento', formato: texto },
  grams: { rotulo: 'Quantidade', formato: comUnidade('g') },
  kcal: { rotulo: 'Calorias', formato: comUnidade('kcal', 0) },
  proteinG: { rotulo: 'Proteína', formato: comUnidade('g') },
  carbsG: { rotulo: 'Carboidrato', formato: comUnidade('g') },
  fatG: { rotulo: 'Gordura', formato: comUnidade('g') },
  name: { rotulo: 'Nome', formato: texto },
  title: { rotulo: 'Título', formato: texto },
  description: { rotulo: 'Descrição', formato: texto },
  content: { rotulo: 'O que lembrar', formato: texto },
  kcalPer100g: { rotulo: 'Calorias em 100 g', formato: comUnidade('kcal', 0) },
  proteinPer100g: { rotulo: 'Proteína em 100 g', formato: comUnidade('g') },
  carbsPer100g: { rotulo: 'Carboidrato em 100 g', formato: comUnidade('g') },
  fatPer100g: { rotulo: 'Gordura em 100 g', formato: comUnidade('g') },
  kcalMin: { rotulo: 'Calorias mínimas', formato: comUnidade('kcal', 0) },
  kcalMax: { rotulo: 'Calorias máximas', formato: comUnidade('kcal', 0) },
  proteinMinG: { rotulo: 'Proteína mínima', formato: comUnidade('g', 0) },
  proteinMaxG: { rotulo: 'Proteína máxima', formato: comUnidade('g', 0) },
  carbsMinG: { rotulo: 'Carboidrato mínimo', formato: comUnidade('g', 0) },
  carbsMaxG: { rotulo: 'Carboidrato máximo', formato: comUnidade('g', 0) },
  fatMinG: { rotulo: 'Gordura mínima', formato: comUnidade('g', 0) },
  fatMaxG: { rotulo: 'Gordura máxima', formato: comUnidade('g', 0) },
  weeklyWorkouts: { rotulo: 'Treinos por semana', formato: semUnidade },
  dailyStepsTarget: { rotulo: 'Passos por dia', formato: comUnidade('passos', 0) },
  dailyWaterTargetMl: { rotulo: 'Água por dia', formato: comUnidade('ml', 0) },
  label: { rotulo: 'Nutriente', formato: texto },
  unit: { rotulo: 'Unidade', formato: texto },
  min: { rotulo: 'Mínimo', formato: semUnidade },
  max: { rotulo: 'Máximo', formato: semUnidade },
  period: { rotulo: 'Período', formato: deMapa({ daily: 'Por dia' }) },
  weightKg: { rotulo: 'Peso', formato: comUnidade('kg') },
  ml: { rotulo: 'Água', formato: comUnidade('ml', 0) },
  steps: { rotulo: 'Passos', formato: comUnidade('passos', 0) },
  source: { rotulo: 'Origem', formato: deMapa(ORIGEM_DOS_PASSOS) },
  reps: { rotulo: 'Repetições', formato: semUnidade },
  rpe: { rotulo: 'Esforço (0 a 10)', formato: semUnidade },
  durationSeconds: {
    rotulo: 'Duração',
    formato: (valor) => {
      if (typeof valor !== 'number') return null;
      const minutos = Math.floor(valor / 60);
      const segundos = Math.round(valor % 60);
      if (!minutos) return `${segundos} s`;
      return segundos ? `${minutos} min ${segundos} s` : `${minutos} min`;
    },
  },
  distanceMeters: {
    rotulo: 'Distância',
    formato: (valor) =>
      typeof valor !== 'number'
        ? null
        : valor >= 1000
          ? `${numero(valor / 1000, 2)} km`
          : `${numero(valor, 0)} m`,
  },
  avgHeartRate: { rotulo: 'Frequência cardíaca média', formato: comUnidade('bpm', 0) },
  kcalBurned: { rotulo: 'Calorias gastas', formato: comUnidade('kcal', 0) },
  order: { rotulo: 'Posição no treino', formato: semUnidade },
  targetSets: { rotulo: 'Séries', formato: semUnidade },
  targetReps: { rotulo: 'Repetições', formato: texto },
  kind: {
    rotulo: 'Tipo',
    formato: (valor) =>
      typeof valor === 'string' ? (FOCO_DO_BLOCO[valor] ?? TIPO_DE_META[valor] ?? valor) : null,
  },
  sessionsPerWeek: { rotulo: 'Treinos por semana', formato: semUnidade },
  muscleGroup: {
    rotulo: 'Grupo muscular',
    formato: (valor) =>
      typeof valor === 'string' && valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : null,
  },
  primaryMuscles: { rotulo: 'Músculos principais', formato: listaDeMapa(MUSCULOS) },
  secondaryMuscles: { rotulo: 'Músculos secundários', formato: listaDeMapa(MUSCULOS) },
  equipment: { rotulo: 'Equipamento', formato: deMapa(EQUIPAMENTO) },
  level: { rotulo: 'Nível', formato: deMapa(NIVEL) },
  mechanic: { rotulo: 'Tipo de movimento', formato: deMapa(MECANICA) },
  instructions: {
    rotulo: 'Instruções',
    formato: (valor) =>
      Array.isArray(valor) && valor.length
        ? `${valor.length} ${valor.length === 1 ? 'passo' : 'passos'}`
        : null,
  },
  startValue: { rotulo: 'Valor inicial', formato: semUnidade },
  targetValue: { rotulo: 'Objetivo', formato: semUnidade },
  lastReportedValue: { rotulo: 'Valor atual', formato: semUnidade },
  status: { rotulo: 'Situação', formato: deMapa(SITUACAO_DA_META) },
  heightCm: { rotulo: 'Altura', formato: comUnidade('cm', 0) },
  timezone: { rotulo: 'Fuso horário', formato: fuso },
};

/**
 * Campos que existem mas não dizem nada a quem confirma: a chave interna de um
 * nutriente (o `label` ao lado já diz o nome), o id do vídeo, a lista crua de
 * micronutrientes de um item.
 */
export const OCULTOS = new Set(['nutrientKey', 'youtubeVideoId', 'youtubeVideoIdPt', 'nutrients']);

/**
 * Campos que apontam para um registro. **Nunca aparecem como id**: o serviço de
 * prévia troca pelo nome do que eles apontam, e um id que não resolve recusa o
 * resumo inteiro — ver `PreviaDaAcaoService`.
 */
export const IDS = {
  foodId: 'alimento',
  groupId: 'grupo',
  exerciseId: 'exercicio',
  mealId: 'refeicao',
  planId: 'plano',
  sessionId: 'treino',
  goalId: 'meta',
  memoryId: 'memoria',
  linkId: 'profissional',
  weightLogId: 'peso',
  stepLogId: 'passos',
  setId: 'serie',
  planExerciseId: 'exercicioDoPlano',
} as const;

export type TipoDeRegistro = (typeof IDS)[keyof typeof IDS] | 'itemDaRefeicao' | 'agua';

/** O `id` cru muda de sentido conforme a tool — ver `tipoDoCampoId`. */
export const ID_POR_TOOL: Record<string, TipoDeRegistro> = {
  update_meal: 'refeicao',
  update_meal_item: 'itemDaRefeicao',
  update_custom_food: 'alimento',
  update_water_log: 'agua',
  clone_exercise: 'exercicio',
  update_custom_exercise: 'exercicio',
};

export const ROTULO_DO_REGISTRO: Record<TipoDeRegistro, string> = {
  alimento: 'Alimento',
  grupo: 'Grupo',
  exercicio: 'Exercício',
  refeicao: 'Refeição',
  plano: 'Plano',
  treino: 'Treino',
  meta: 'Meta',
  memoria: 'Memória',
  profissional: 'Profissional',
  peso: 'Registro de peso',
  passos: 'Registro de passos',
  serie: 'Série',
  exercicioDoPlano: 'Exercício do plano',
  itemDaRefeicao: 'Item',
  agua: 'Registro de água',
};

/** Campos com forma própria no cartão, montados pelo serviço. */
export const COMPOSTOS = new Set(['items', 'exercises']);

export function tipoDoCampo(tool: string, campo: string): TipoDeRegistro | null {
  if (campo === 'id') return ID_POR_TOOL[tool] ?? null;
  return (IDS as Record<string, TipoDeRegistro>)[campo] ?? null;
}
