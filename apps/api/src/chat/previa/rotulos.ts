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

const simOuNao: Formato = (valor) => (typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : null);

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

/** `[{label: 'porção', grams: 30}]` → "porção (30 g)". */
const medidas: Formato = (valor) => {
  if (!Array.isArray(valor) || !valor.length) return null;
  const partes = valor.flatMap((m: unknown) => {
    const { label, grams } = (m ?? {}) as { label?: unknown; grams?: unknown };
    return typeof label === 'string' && typeof grams === 'number'
      ? [`${label.trim()} (${numero(grams)} g)`]
      : [];
  });
  return partes.length ? partes.join(', ') : null;
};

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
/** Os tipos de lembrete (#389), como a prancha Al-V3 os chama. */
const TIPO_DE_LEMBRETE: Record<string, string> = {
  WATER: 'Água',
  MEAL: 'Refeição',
  WEIGHT: 'Pesagem',
  WORKOUT: 'Treino',
  STEPS: 'Passos',
};
const DIA_DA_SEMANA: Record<number, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
};
/** Os tipos de aviso da prancha Al-V4 (#389). */
const TIPO_DE_AVISO: Record<string, string> = {
  COMMUNITY: 'Comunidade',
  ANNOUNCEMENTS: 'Comunicados da comunidade',
  SCHEDULE: 'Agenda da comunidade',
  SCHEDULE_REMINDER: 'Treino do dia',
  CHALLENGES: 'Desafios',
  FEED: 'Mural',
  MODERATION: 'Moderação',
  CHAT: 'Chat com a IA',
  PLAN_RECEIVED: 'Plano novo',
  ASSESSMENT_REQUESTED: 'Avaliação pedida',
  QUESTIONNAIRE: 'Questionário',
  BIRTHDAY: 'Aniversário',
  REMINDERS: 'Lembretes',
};
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

const SEXO: Record<string, string> = { FEMALE: 'Feminino', MALE: 'Masculino' };
const ATIVIDADE: Record<string, string> = {
  SEDENTARY: 'Sedentário',
  LIGHT: 'Leve',
  MODERATE: 'Moderado',
  ACTIVE: 'Ativo',
  VERY_ACTIVE: 'Muito ativo',
};
const OBJETIVO: Record<string, string> = {
  LOSE: 'Perder peso',
  MAINTAIN: 'Manter o peso',
  GAIN: 'Ganhar peso',
};

/** "1996-03-12" → "12/03/1996": nascimento não é "ontem" nem "terça". */
const nascimento: Formato = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split('-');
  return `${d}/${m}/${a}`;
};

/** "America/Sao_Paulo" → "São Paulo": o nome do fuso é o da cidade, sem o continente. */
const fuso: Formato = (valor) => {
  if (typeof valor !== 'string' || !valor) return null;
  const cidade = valor.split('/').pop()?.replace(/_/g, ' ') ?? valor;
  return cidade === 'Sao Paulo' ? 'São Paulo' : cidade;
};

/** As categorias do consentimento (ADR 026), como a tela de entrar na comunidade diz. */
const ESCOPOS: Record<string, string> = {
  WORKOUT: 'Treino',
  NUTRITION: 'Alimentação',
  BODY: 'Peso e medidas',
  HABITS: 'Água e passos',
  GOALS: 'Metas',
};

/** Lista vazia é uma escolha, e o cartão diz qual: não compartilhar nada. */
const escopos: Formato = (valor, ctx) =>
  Array.isArray(valor) ? (valor.length ? listaDeMapa(ESCOPOS)(valor, ctx) : 'Nada') : null;

const TECNICA: Record<string, string> = {
  NORMAL: 'Normal',
  DROP_SET: 'Drop-set',
  TO_FAILURE: 'Até a falha',
};

export const CAMPOS: Record<string, Campo> = {
  // `mark_inbox_read` (#373): quantos avisos; sem a lista, a tool marca todos.
  ids: {
    rotulo: 'Avisos marcados como lidos',
    formato: (valor) =>
      Array.isArray(valor) ? (valor.length === 1 ? '1 aviso' : `${valor.length} avisos`) : null,
  },
  scopes: { rotulo: 'Compartilha com a equipe', formato: escopos },
  applyGoals: {
    rotulo: 'Trocar minhas metas pelas do plano',
    formato: (valor) => (typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : null),
  },
  saveMeals: {
    rotulo: 'Guardar as refeições sugeridas',
    formato: (valor) => (typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : null),
  },
  statsOptIn: {
    rotulo: 'Estatísticas agregadas',
    formato: (valor) =>
      typeof valor === 'boolean' ? (valor ? 'Participa' : 'Não participa') : null,
  },
  mealType: { rotulo: 'Refeição', formato: deMapa(TIPO_DA_REFEICAO) },
  eatenAt: { rotulo: 'Quando', formato: dataEHora },
  loggedAt: { rotulo: 'Quando', formato: dataEHora },
  startedAt: { rotulo: 'Início', formato: dataEHora },
  completedAt: { rotulo: 'Fim', formato: dataEHora },
  date: { rotulo: 'Dia', formato: dia },
  fromDate: { rotulo: 'Copiar de', formato: dia },
  toDate: { rotulo: 'Copiar para', formato: dia },
  deadline: { rotulo: 'Prazo', formato: dia },
  notes: { rotulo: 'Observação', formato: texto },
  // O fim do treino (#377): a escala de 5 do canvas e as respostas rápidas.
  feeling: {
    rotulo: 'Como foi o treino',
    formato: (valor) =>
      typeof valor === 'number'
        ? (['Leve', 'Firme', 'Puxado', 'Muito puxado', 'No limite'][valor - 1] ?? null)
        : null,
  },
  difficulty: { rotulo: 'Dificuldade (1 a 5)', formato: semUnidade },
  fatigue: { rotulo: 'Cansaço (1 a 5)', formato: semUnidade },
  motivation: { rotulo: 'Motivação (1 a 5)', formato: semUnidade },
  pain: { rotulo: 'Sentiu dor', formato: simOuNao },
  painLocation: { rotulo: 'Onde doeu', formato: texto },
  foodName: { rotulo: 'Alimento', formato: texto },
  favorite: { rotulo: 'Favorito', formato: simOuNao },
  grams: { rotulo: 'Quantidade', formato: comUnidade('g') },
  portions: { rotulo: 'Medidas', formato: medidas },
  // Duas casas: um quarto de colher (0,25) não pode virar "0,3".
  quantity: {
    rotulo: 'Quantas medidas',
    formato: (valor) => (typeof valor === 'number' ? numero(valor, 2) : null),
  },
  kcal: { rotulo: 'Calorias', formato: comUnidade('kcal', 0) },
  proteinG: { rotulo: 'Proteína', formato: comUnidade('g') },
  carbsG: { rotulo: 'Carboidrato', formato: comUnidade('g') },
  fatG: { rotulo: 'Gordura', formato: comUnidade('g') },
  name: { rotulo: 'Nome', formato: texto },
  title: { rotulo: 'Título', formato: texto },
  // O apelido da comunidade vale para o ranking e para o mural.
  displayName: { rotulo: 'Apelido na comunidade', formato: texto },
  body: { rotulo: 'Texto', formato: texto },
  description: { rotulo: 'Descrição', formato: texto },
  content: { rotulo: 'O que lembrar', formato: texto },
  kcalPer100g: { rotulo: 'Calorias em 100 g', formato: comUnidade('kcal', 0) },
  proteinPer100g: { rotulo: 'Proteína em 100 g', formato: comUnidade('g') },
  carbsPer100g: { rotulo: 'Carboidrato em 100 g', formato: comUnidade('g') },
  fatPer100g: { rotulo: 'Gordura em 100 g', formato: comUnidade('g') },
  // O código que a pessoa vincula ao próprio alimento (#375): quem confirma vê o número.
  // `null` no update_custom_food desfaz o vínculo.
  barcode: {
    rotulo: 'Código de barras',
    formato: (valor, ctx) => (valor === null ? 'tirar o vínculo' : texto(valor, ctx)),
  },
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
  sex: { rotulo: 'Sexo', formato: deMapa(SEXO) },
  birthDate: { rotulo: 'Nascimento', formato: nascimento },
  activityLevel: { rotulo: 'Atividade', formato: deMapa(ATIVIDADE) },
  objective: { rotulo: 'Objetivo', formato: deMapa(OBJETIVO) },
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
  // Configuração do exercício no plano (#378).
  restSeconds: { rotulo: 'Descanso', formato: comUnidade('s', 0) },
  technique: { rotulo: 'Técnica', formato: deMapa(TECNICA) },
  biSetWithNext: { rotulo: 'Bi-set com o próximo', formato: simOuNao },
  startLoadKg: { rotulo: 'Carga inicial', formato: comUnidade('kg') },
  loadMode: {
    rotulo: 'Carga',
    formato: deMapa({ WEIGHT: 'Carga externa', BODYWEIGHT: 'Peso do corpo' }),
  },
  repUnit: { rotulo: 'Conta por', formato: deMapa({ REPS: 'Repetições', SECONDS: 'Segundos' }) },
  cardioTarget: {
    rotulo: 'Meta do cardio',
    formato: deMapa({ TIME: 'Tempo', DISTANCE: 'Distância' }),
  },
  cardioDurationSeconds: {
    rotulo: 'Duração alvo',
    formato: (valor) => (typeof valor === 'number' ? `${numero(valor / 60, 1)} min` : null),
  },
  cardioDistanceMeters: {
    rotulo: 'Distância alvo',
    formato: (valor) => (typeof valor === 'number' ? `${numero(valor / 1000, 2)} km` : null),
  },
  cardioIntensity: {
    rotulo: 'Intensidade',
    formato: deMapa({ LIGHT: 'Leve', MODERATE: 'Moderada', VIGOROUS: 'Forte' }),
  },
  sets: {
    rotulo: 'Série por série',
    formato: (valor) => {
      if (!Array.isArray(valor)) return null;
      if (!valor.length) return 'Séries iguais';
      return valor
        .map((x: unknown) => {
          const { reps, loadKg } = (x ?? {}) as { reps?: unknown; loadKg?: unknown };
          const carga = typeof loadKg === 'number' ? ` × ${numero(loadKg)} kg` : '';
          return typeof reps === 'number' ? `${reps}${carga}` : '?';
        })
        .join(', ');
    },
  },
  kind: {
    rotulo: 'Tipo',
    formato: (valor) =>
      typeof valor === 'string'
        ? (FOCO_DO_BLOCO[valor] ?? TIPO_DE_META[valor] ?? TIPO_DE_LEMBRETE[valor] ?? valor)
        : null,
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
  // Apelido e bio do perfil (#387): aparecem a quem a visibilidade deixa, nas comunidades.
  nickname: { rotulo: 'Nome nas comunidades', formato: texto },
  bio: { rotulo: 'Sobre você', formato: texto },
  loadUnit: { rotulo: 'Carga em', formato: deMapa({ KG: 'Quilos (kg)', LB: 'Libras (lb)' }) },
  distanceUnit: {
    rotulo: 'Distância em',
    formato: deMapa({ KM: 'Quilômetros (km)', M: 'Metros (m)', MI: 'Milhas (mi)' }),
  },
  // Lembretes (#389): o horário já vem em "hh:mm", no fuso da pessoa.
  mode: { rotulo: 'Como', formato: deMapa({ INTERVAL: 'Intervalo', TIMES: 'Horários fixos' }) },
  everyHours: { rotulo: 'A cada', formato: comUnidade('h', 0) },
  from: { rotulo: 'Primeiro aviso', formato: texto },
  to: { rotulo: 'Último aviso', formato: texto },
  times: {
    rotulo: 'Horários',
    formato: (valor) =>
      Array.isArray(valor) && valor.length ? valor.map(String).join(', ') : null,
  },
  weekdays: {
    rotulo: 'Dias',
    formato: (valor) =>
      Array.isArray(valor) && valor.length
        ? valor.length === 7
          ? 'Todos os dias'
          : valor.map((d) => DIA_DA_SEMANA[Number(d)] ?? String(d)).join(', ')
        : null,
  },
  stepsBelow: { rotulo: 'Só se abaixo de', formato: comUnidade('passos', 0) },
  enabled: { rotulo: 'Ligado', formato: simOuNao },
  // Preferências de aviso (#389).
  preferences: {
    rotulo: 'Avisos',
    formato: (valor) => {
      if (!valor || typeof valor !== 'object') return null;
      const partes = Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'boolean')
        .map(([k, v]) => `${TIPO_DE_AVISO[k] ?? k}: ${v ? 'ligado' : 'desligado'}`);
      return partes.length ? partes.join(', ') : null;
    },
  },
  quietHoursEnabled: { rotulo: 'Silêncio noturno', formato: simOuNao },
  quietFrom: { rotulo: 'Silêncio começa', formato: texto },
  quietTo: { rotulo: 'Silêncio termina', formato: texto },
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
  portionId: 'medida',
  templateId: 'modelo',
} as const;

export type TipoDeRegistro =
  | (typeof IDS)[keyof typeof IDS]
  | 'itemDaRefeicao'
  | 'agua'
  | 'comunidade'
  | 'convite'
  | 'planoDaComunidade'
  | 'desafioDaComunidade'
  | 'postDaComunidade'
  | 'lembrete'
  | 'planoAlimentar'
  | 'refeicaoDoPlano'
  | 'opcaoDoPlano'
  | 'itemDoPlano'
  | 'equivalenteDoPlano'
  | 'trocaDoPlano';

/**
 * Campo cujo sentido muda com a tool. `groupId` é grupo de alimento em
 * `create_custom_food` e comunidade em `set_group_sharing`: resolver o segundo
 * pelo primeiro recusava todo cartão de consentimento.
 */
export const CAMPO_POR_TOOL: Record<string, Record<string, TipoDeRegistro>> = {
  set_group_sharing: { groupId: 'comunidade' },
  accept_group_invite: { token: 'convite' },
  // `templateId` aqui é plano pronto da comunidade, não refeição salva.
  adopt_group_plan: { groupId: 'comunidade', templateId: 'planoDaComunidade' },
  join_group_challenge: { groupId: 'comunidade', challengeId: 'desafioDaComunidade' },
  create_group_post: { groupId: 'comunidade' },
  comment_on_group_post: { groupId: 'comunidade', postId: 'postDaComunidade' },
  // Plano alimentar do profissional (#376): `planId` aqui não é plano de treino.
  accept_nutrition_plan: { planId: 'planoAlimentar' },
  log_plan_meal: { planMealId: 'refeicaoDoPlano', optionId: 'opcaoDoPlano' },
  swap_plan_item: { itemId: 'itemDoPlano', equivalentId: 'equivalenteDoPlano' },
  undo_plan_swap: { swapId: 'trocaDoPlano' },
};

/** O `id` cru muda de sentido conforme a tool — ver `tipoDoCampoId`. */
export const ID_POR_TOOL: Record<string, TipoDeRegistro> = {
  update_meal: 'refeicao',
  update_meal_item: 'itemDaRefeicao',
  update_custom_food: 'alimento',
  set_food_favorite: 'alimento',
  set_exercise_favorite: 'exercicio',
  update_water_log: 'agua',
  update_reminder: 'lembrete',
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
  medida: 'Medida',
  modelo: 'Refeição salva',
  itemDaRefeicao: 'Item',
  agua: 'Registro de água',
  comunidade: 'Comunidade',
  convite: 'Comunidade',
  planoDaComunidade: 'Plano da comunidade',
  desafioDaComunidade: 'Desafio',
  postDaComunidade: 'Post',
  lembrete: 'Lembrete',
  planoAlimentar: 'Plano alimentar',
  refeicaoDoPlano: 'Refeição do plano',
  opcaoDoPlano: 'Opção',
  itemDoPlano: 'Item do plano',
  equivalenteDoPlano: 'Trocar por',
  trocaDoPlano: 'Troca',
};

/** Campos com forma própria no cartão, montados pelo serviço. */
export const COMPOSTOS = new Set(['items', 'exercises']);

export function tipoDoCampo(tool: string, campo: string): TipoDeRegistro | null {
  const proprio = CAMPO_POR_TOOL[tool]?.[campo];
  if (proprio) return proprio;
  if (campo === 'id') return ID_POR_TOOL[tool] ?? null;
  return (IDS as Record<string, TipoDeRegistro>)[campo] ?? null;
}
