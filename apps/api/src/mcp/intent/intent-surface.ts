import { GoalStatus, MealType, ShareScope } from '@prisma/client';
import { z, type ZodRawShape } from 'zod';
import type { McpToolAnnotations, McpToolDef } from '../../common/decorators/tool.decorator';

/**
 * A superfície de **intenção** do eval da fronteira de tools — o braço B de
 * `docs/eval-fronteira-de-tools.md`.
 *
 * Aqui mora só o **contrato** (nome, descrição, anotações, input e as tools de
 * entidade que cada uma compõe). Nada daqui é servido: este arquivo não é um
 * `*.tool.ts`, não carrega `@McpTool()` e o `McpToolRegistry` não o enxerga. O
 * contrato existe antes do `execute` porque o conjunto de tarefas precisa dele
 * para ser congelado — sem o nome dos campos não há `argumentos_b` para
 * escrever, e a métrica de parâmetros sairia de um braço só.
 *
 * Três regras, todas conferidas por `eval-tarefas.spec.ts`:
 *
 * 1. **A anotação é a mais restritiva das pernas.** Compor leitura com escrita
 *    confirmável dá confirmável; compor com uma tool RESTRICTED dá RESTRICTED.
 *    Uma tool de intenção não atravessa classe de reversibilidade.
 * 2. **Destrutiva não se redesenha.** Toda tool com `destructiveHint: true` é
 *    servida igual nos dois braços — mesmo nome, mesma descrição, mesmo schema.
 *    A métrica 6 mede o quanto a *vizinhança* de uma destrutiva faz o modelo
 *    esbarrar nela; se o braço B tivesse outra destrutiva, ou nenhuma, a métrica
 *    mediria a tool, e o braço B ganharia por construção.
 * 3. **Onde a intenção já é a operação de entidade, a tool é a mesma.** Um
 *    `create_custom_food` renomeado seria uma segunda variável — nome — e nenhuma
 *    diferença de abstração.
 *
 * Os nomes seguem a convenção do braço A (inglês, `verb_noun`), e as descrições
 * são em português como lá. Nomes em português no braço B tornariam o idioma uma
 * variável a mais: "registra meu café" casa lexicalmente com `registrar_refeicao`
 * e não com `log_meal`, e o ganho não seria de abstração.
 */

export interface IntentToolSpec {
  name: string;
  title: string;
  description: string;
  annotations: McpToolAnnotations;
  /** As tools de entidade cujas pernas o `execute` percorre. */
  compoe: readonly string[];
  inputSchema: ZodRawShape;
}

/** Tools de entidade servidas iguais no braço B, além das destrutivas (regra 2). */
export const SHARED_ENTITY_TOOLS = ['create_custom_food', 'update_me', 'export_my_data'] as const;

export function isSharedWithIntentSurface(tool: Pick<McpToolDef, 'name' | 'annotations'>): boolean {
  return (
    tool.annotations.destructiveHint === true ||
    (SHARED_ENTITY_TOOLS as readonly string[]).includes(tool.name)
  );
}

const READ_ONLY: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  confirmableHint: false,
};
const CONFIRMABLE: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  confirmableHint: true,
};
const RESTRICTED: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  confirmableHint: false,
};

/**
 * Datas relativas resolvidas **no servidor**, no fuso da conta. No braço A o
 * modelo converte "ontem" em ISO sozinho, e errar o fuso é um erro de parâmetro
 * clássico; aqui quem sabe o fuso é quem resolve.
 */
const day = z
  .string()
  .regex(
    /^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})$/,
  )
  .describe(
    'Dia: "today", "yesterday", um dia da semana em inglês ("tuesday" = a ocorrência mais recente, ' +
      'hoje incluso) ou YYYY-MM-DD. Resolvido no fuso da conta. Sem valor, é hoje.',
  );

const period = z
  .enum([
    'this_week',
    'last_7_days',
    'this_month',
    'last_30_days',
    'last_90_days',
    'last_180_days',
    'last_365_days',
  ])
  .describe('Janela, no fuso da conta. "this_week" começa na segunda; "last_7_days" inclui hoje.');

const macros = {
  kcal: z.number().min(0).optional().describe('kcal do item, quando não vier do catálogo'),
  proteinG: z.number().min(0).optional().describe('Proteína em gramas'),
  carbsG: z.number().min(0).optional().describe('Carboidrato em gramas'),
  fatG: z.number().min(0).optional().describe('Gordura em gramas'),
};

export const INTENT_TOOLS: readonly IntentToolSpec[] = [
  {
    name: 'get_day_overview',
    title: 'Ver o dia',
    annotations: READ_ONLY,
    description:
      'Um dia inteiro numa chamada: totais de kcal e macros contra a meta (e quanto falta), as ' +
      'refeições com o total de cada uma, água e passos contra a meta, os treinos do dia e a ' +
      'sequência atual. Responde "como foi meu dia", "quanto falta de proteína", "quanta água ' +
      'bebi hoje". Para os itens de uma refeição, use find_meals.',
    compoe: [
      'get_nutrition_summary',
      'get_nutrition_goals',
      'get_water_for_date',
      'get_steps_for_date',
      'get_streak',
      'list_workout_sessions',
    ],
    inputSchema: { day: day.optional() },
  },
  {
    name: 'get_period_overview',
    title: 'Ver um período',
    annotations: READ_ONLY,
    description:
      'Tendência de um período, comparada ao período anterior de mesmo tamanho: média diária de ' +
      'kcal e macros contra a meta, água e passos contra a meta (dias batidos), variação de peso e ' +
      'volume de treino. Responde "minha média de proteína na semana", "tô batendo a meta de água", ' +
      '"quanto perdi de peso", "meu volume caiu".',
    compoe: [
      'get_week_summary',
      'get_nutrition_history',
      'get_water_history',
      'get_water_progress',
      'get_steps_history',
      'get_steps_progress',
      'get_weight_progress',
      'get_volume_progress',
    ],
    inputSchema: { period },
  },
  {
    name: 'find_meals',
    title: 'Encontrar refeições',
    annotations: READ_ONLY,
    description:
      'Refeições com os itens (alimento, gramas, macros e id de cada item), filtradas por dia, tipo ' +
      'e alimento. Responde "o que almocei na terça", "quanto de arroz tem na marmita". Os ids ' +
      'servem para as tools que apagam.',
    compoe: ['list_meals', 'get_meal'],
    inputSchema: {
      day: day.optional(),
      mealType: z.nativeEnum(MealType).optional().describe('BREAKFAST, LUNCH, DINNER ou SNACK'),
      food: z
        .string()
        .min(2)
        .optional()
        .describe('Só refeições que tenham um item com este nome (busca parcial)'),
    },
  },
  {
    name: 'record_meal',
    title: 'Registrar refeição',
    annotations: CONFIRMABLE,
    description:
      'Registra uma refeição a partir do nome dos alimentos. Cada item é casado pelo nome com o ' +
      'catálogo (TACO e alimentos próprios da pessoa) e a resposta diz com qual entrada casou; sem ' +
      'correspondência, usa os macros informados, e sem eles o item é recusado com o motivo. ' +
      'Exemplo: {"mealType":"BREAKFAST","items":[{"food":"ovo mexido","grams":100},' +
      '{"food":"café sem açúcar","grams":150}]}',
    compoe: ['search_food', 'log_meal'],
    inputSchema: {
      mealType: z.nativeEnum(MealType).describe('BREAKFAST, LUNCH, DINNER ou SNACK'),
      eatenAt: z.string().optional().describe('Quando comeu, em ISO 8601. Sem valor, é agora.'),
      notes: z.string().max(500).optional(),
      items: z
        .array(
          z.object({
            food: z.string().min(2).describe('Nome do alimento, com o preparo: "ovo mexido"'),
            grams: z.number().min(0.1).describe('Gramas estimados da porção'),
            ...macros,
          }),
        )
        .min(1),
    },
  },
  {
    name: 'fix_meal',
    title: 'Corrigir refeição',
    annotations: CONFIRMABLE,
    description:
      'Corrige uma refeição já registrada, apontada por dia e tipo. Com `item`, muda a porção ou os ' +
      'macros daquele alimento; sem `item`, muda tipo, horário ou observação da refeição. Não ' +
      'remove nada — para tirar um item, use delete_meal_item com o id que find_meals devolve. ' +
      'Exemplo: {"day":"today","mealType":"LUNCH","item":"feijão","grams":150}',
    compoe: ['list_meals', 'get_meal', 'update_meal_item', 'update_meal'],
    inputSchema: {
      day: day.optional(),
      mealType: z.nativeEnum(MealType).describe('A refeição a corrigir'),
      item: z.string().min(2).optional().describe('Nome do alimento dentro da refeição'),
      grams: z.number().min(0.1).optional(),
      ...macros,
      newMealType: z.nativeEnum(MealType).optional(),
      eatenAt: z.string().optional().describe('Novo horário, em ISO 8601'),
      notes: z.string().max(500).optional(),
    },
  },
  {
    name: 'update_my_targets',
    title: 'Ajustar metas diárias',
    annotations: CONFIRMABLE,
    description:
      'Ajusta metas diárias: kcal, macros, água, passos, treinos por semana e limites de nutrientes. ' +
      '**Só os campos enviados mudam**; os outros continuam como estão. Exemplo: {"proteinMinG":180}',
    compoe: ['get_nutrition_goals', 'set_nutrition_goals', 'set_nutrient_target'],
    inputSchema: {
      kcalMin: z.number().int().min(0).optional(),
      kcalMax: z.number().int().min(0).optional(),
      proteinMinG: z.number().int().min(0).optional(),
      proteinMaxG: z.number().int().min(0).optional(),
      carbsMinG: z.number().int().min(0).optional(),
      carbsMaxG: z.number().int().min(0).optional(),
      fatMinG: z.number().int().min(0).optional(),
      fatMaxG: z.number().int().min(0).optional(),
      weeklyWorkouts: z.number().int().min(0).optional(),
      dailyStepsTarget: z.number().int().min(0).optional(),
      dailyWaterTargetMl: z.number().int().min(0).optional(),
      nutrient: z
        .object({
          nutrientKey: z.string().max(40).describe('Chave usada nos itens, ex.: "sodium_mg"'),
          label: z.string().max(40),
          unit: z.string().max(12),
          min: z.number().min(0).optional(),
          max: z.number().min(0).optional(),
        })
        .optional()
        .describe('Limite ou meta mínima de um nutriente, ex.: sódio até 2000 mg'),
    },
  },
  {
    name: 'record_measurement',
    title: 'Registrar medida',
    annotations: CONFIRMABLE,
    description:
      'Registra água, passos ou peso de um dia. A unidade está no nome do tipo. ' +
      'Exemplo: {"kind":"steps","value":8500,"day":"yesterday"}',
    compoe: ['log_water', 'log_steps', 'log_weight'],
    inputSchema: {
      // Enum fechado com payload homogêneo (um número e um dia), e não um `tipo` que muda a forma
      // do resto do input — essa é a linha que separa isto do schema polimórfico que
      // docs/MCP_TOOL_SURFACE.md descarta.
      kind: z.enum(['water_ml', 'steps', 'weight_kg']),
      value: z.number().positive(),
      day: day.optional(),
      notes: z.string().max(500).optional(),
    },
  },
  {
    name: 'start_workout',
    title: 'Começar treino',
    annotations: CONFIRMABLE,
    description:
      'Começa uma sessão de treino a partir do nome do plano (busca parcial) e devolve os exercícios ' +
      'do plano com a última carga de cada um. Sem plano, é treino livre. ' +
      'Exemplo: {"plan":"peito"}',
    compoe: ['list_workout_plans', 'get_workout_plan', 'start_workout_session'],
    inputSchema: {
      plan: z.string().min(2).optional().describe('Nome do plano, busca parcial'),
      notes: z.string().max(500).optional(),
    },
  },
  {
    name: 'record_sets',
    title: 'Registrar séries',
    annotations: CONFIRMABLE,
    description:
      'Registra uma ou mais séries iguais de um exercício na sessão em andamento. O exercício é ' +
      'resolvido pelo nome, priorizando os que a pessoa já treinou. Sem sessão em andamento, recusa ' +
      'e diz para começar uma. Exemplo: {"exercise":"supino","sets":3,"reps":10,"weightKg":60}',
    compoe: ['get_active_workout_session', 'search_exercise', 'log_set'],
    inputSchema: {
      exercise: z.string().min(2).describe('Nome do exercício, busca parcial'),
      sets: z.number().int().min(1).max(20).default(1).describe('Quantas séries iguais'),
      reps: z.number().int().min(0).optional(),
      weightKg: z.number().min(0).optional(),
      rpe: z.number().min(0).max(10).optional(),
      durationSeconds: z.number().int().min(1).optional().describe('Cardio: duração'),
      distanceMeters: z.number().min(0).optional().describe('Cardio: distância'),
    },
  },
  {
    name: 'finish_workout',
    title: 'Encerrar treino',
    annotations: CONFIRMABLE,
    description: 'Encerra a sessão de treino em andamento e devolve o resumo dela. Exemplo: {}',
    compoe: ['get_active_workout_session', 'finish_workout_session'],
    inputSchema: { notes: z.string().max(500).optional() },
  },
  {
    name: 'get_exercise_insight',
    title: 'Consultar exercício',
    annotations: READ_ONLY,
    description:
      'Tudo sobre um exercício, pelo nome (resolvido priorizando os que a pessoa já treinou): última ' +
      'sessão, recorde, evolução de carga ou de cardio, carga sugerida para hoje e como executar. ' +
      'Responde "quanto fiz no supino", "meu recorde no agachamento", "como faz remada curvada". ' +
      '`aspect` restringe a resposta; sem ele, vem tudo.',
    compoe: [
      'search_exercise',
      'get_exercise_details',
      'explain_form',
      'get_last_set_for_exercise',
      'get_personal_record',
      'get_strength_progress',
      'get_cardio_progress',
      'get_load_prescription',
    ],
    inputSchema: {
      exercise: z.string().min(2).describe('Nome do exercício, busca parcial'),
      aspect: z
        .enum(['last_session', 'personal_record', 'progress', 'next_load', 'technique'])
        .optional(),
      days: z
        .union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
        .optional()
        .describe('Janela da evolução. Sem valor, 90.'),
    },
  },
  {
    name: 'edit_workout_plan',
    title: 'Editar plano de treino',
    annotations: CONFIRMABLE,
    description:
      'Edita um plano de treino apontado pelo nome: acrescenta exercícios, muda séries e repetições, ' +
      'reordena. Exercício acrescentado sem séries entra com 3 × "8-12", e a resposta diz isso. Não ' +
      'remove — para tirar um exercício, use remove_exercise_from_plan. ' +
      'Exemplo: {"plan":"perna","add":[{"exercise":"leg press"}]}',
    compoe: [
      'list_workout_plans',
      'get_workout_plan',
      'search_exercise',
      'add_exercise_to_plan',
      'update_plan_exercise',
      'reorder_plan_exercises',
    ],
    inputSchema: {
      plan: z.string().min(2).describe('Nome do plano, busca parcial'),
      add: z
        .array(
          z.object({
            exercise: z.string().min(2),
            targetSets: z.number().int().min(1).max(20).optional(),
            targetReps: z.string().max(20).optional(),
          }),
        )
        .optional(),
      update: z
        .array(
          z.object({
            exercise: z.string().min(2),
            targetSets: z.number().int().min(1).max(20).optional(),
            targetReps: z.string().max(20).optional(),
          }),
        )
        .optional(),
      order: z
        .array(z.string().min(2))
        .optional()
        .describe('Nomes dos exercícios na ordem nova; os não citados vão para o fim'),
    },
  },
  {
    name: 'get_goals_overview',
    title: 'Ver metas e conquistas',
    annotations: READ_ONLY,
    description:
      'Metas pessoais com o progresso de cada uma e as conquistas, com as desbloqueadas nos últimos ' +
      '7 dias em destaque. Responde "como tô nas metas", "conquistei algo novo".',
    compoe: ['list_goals', 'get_goal', 'list_achievements'],
    inputSchema: { status: z.nativeEnum(GoalStatus).optional() },
  },
  {
    name: 'mark_goal_done',
    title: 'Concluir meta',
    annotations: CONFIRMABLE,
    description:
      'Marca como concluída uma meta apontada pelo título (busca parcial). ' +
      'Exemplo: {"goal":"correr 5 km"}',
    compoe: ['list_goals', 'complete_goal'],
    inputSchema: {
      goal: z.string().min(2).describe('Título da meta, busca parcial'),
      finalValue: z.number().optional().describe('Valor alcançado, quando a pessoa disser'),
    },
  },
  {
    name: 'get_sharing_overview',
    title: 'Ver compartilhamento',
    annotations: READ_ONLY,
    description:
      'Quem pode ver os dados da pessoa, de quais categorias, em quais grupos — e quem de fato leu, ' +
      'no período. Responde "quem tem acesso aos meus dados", "alguém olhou meu dado".',
    compoe: ['list_my_groups', 'list_data_sharing', 'list_data_access_log'],
    inputSchema: {
      accessLogDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe('Janela da trilha de acesso. Sem valor, 30.'),
    },
  },
  {
    name: 'share_my_data',
    title: 'Liberar dados a um profissional',
    annotations: RESTRICTED,
    description:
      'Libera categorias de dado a um profissional apontado pelo nome, **somando** às que ele já ' +
      'tem. Cada categoria é independente — liberar treino não abre o diário alimentar. ' +
      'Exemplo: {"professional":"Carlos","scopes":["NUTRITION"]}',
    compoe: ['list_data_sharing', 'list_my_groups', 'grant_data_sharing'],
    inputSchema: {
      professional: z.string().min(2).describe('Nome do profissional, busca parcial'),
      scopes: z.array(z.nativeEnum(ShareScope)).min(1),
    },
  },
  {
    name: 'stop_sharing',
    title: 'Revogar acesso de um profissional',
    annotations: CONFIRMABLE,
    description:
      'Revoga todo o acesso de um profissional aos dados da pessoa. Para tirar só uma categoria, ' +
      'é o caminho de liberar de novo com a lista menor. Exemplo: {"professional":"Carlos"}',
    compoe: ['list_data_sharing', 'revoke_data_sharing'],
    inputSchema: {
      professional: z
        .string()
        .min(2)
        .optional()
        .describe('Nome do profissional. Obrigatório quando há mais de um com acesso.'),
    },
  },
  {
    name: 'get_student_overview',
    title: 'Ver um aluno',
    annotations: READ_ONLY,
    description:
      'Lê UMA categoria de um aluno apontado pelo nome, se ele a autorizou. Uma categoria por ' +
      'chamada, e cada leitura fica na trilha que o aluno vê. Responde "como a Ana tá no treino".',
    compoe: ['list_my_students', 'get_student_progress'],
    inputSchema: {
      student: z.string().min(2).describe('Nome do aluno, busca parcial'),
      // Obrigatório como em get_student_progress: ler todas as categorias autorizadas de uma vez
      // mudaria a trilha de acesso que o aluno lê, e não só o formato da chamada.
      scope: z.nativeEnum(ShareScope),
      days: z.number().int().min(1).max(365).optional(),
    },
  },
];
