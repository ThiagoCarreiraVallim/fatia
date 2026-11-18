import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { INTENT_TOOLS, isSharedWithIntentSurface } from '../intent/intent-surface';
import { HEADER_SUPERFICIE, superficieDoHeader, SuperficieDeIntencao } from '../intent/superficie';
import { McpController } from '../mcp.controller';
import { McpToolRegistry } from '../mcp-tool.registry';
import {
  carregarTools,
  catalogoServido,
  registryDeTeste,
  type ToolServida,
} from './support/catalogo-servido';

/**
 * O recorte por superfície do `/mcp` (`docs/eval-fronteira-de-tools.md`, item 3).
 *
 * Os dois `sha256` abaixo são os publicados no doc, na mesma conta que o runner do eval faz
 * (`sha_do_catalogo` em `run_fronteira.py`): o de entidade é a linha de base do braço A, e
 * mudar uma descrição de tool de entidade **é** mudar o braço A — este caso quebra para que
 * isso não aconteça sem alguém ver. O de intenção é o do braço B de hoje: o congelado e medido
 * é `92bc0392…`, e o exemplo do `record_meal` mudou depois da medição, sem medição nova.
 *
 * Os dois são os de hoje, não os medidos: o braço A medido é `3ef29a0d…` (106 tools), e as
 * Fases 3 a 5 (comunidades e planos) acrescentaram 15 tools depois, duas delas destrutivas
 * (`delete_food_portion`, `delete_meal_template`) — que o braço B serve também, por ser
 * destrutivas. A Fase 7a acrescentou mais três (`list_group_plans`, `adopt_group_plan`,
 * `list_group_tips`), e a Fase 8a mais três (`list_group_challenges`,
 * `get_challenge_leaderboard`, `join_group_challenge`), nenhuma destrutiva. Sem medição nova.
 * O `update_meal_item` ganhou `nutrients` (paridade com o REST, ADR 006): muda o braço A.
 * O redesign (#369) acrescentou `get_weekly_muscle_summary` (só leitura): muda o braço A.
 * A #387 mudou `get_me`, `update_me` (apelido, bio e unidades) e `export_my_data` (link de
 * 24 h): mudam os dois braços.
 * O redesign (#373) acrescentou `list_inbox` e `mark_inbox_read` e ampliou a descrição do
 * `get_today_summary` (metas do dia, "Para fazer", avisos): muda o braço A. Com as duas juntas
 * na redesign/etapa-02, os SHAs abaixo são o catálogo somado.
 * A #389 acrescentou seis tools de lembretes e preferências de aviso; `delete_reminder`, por
 * ser destrutiva, é servida também no braço B: mudam os dois braços (B passa a 43, 25 delas
 * compartilhadas).
 * A #374 acrescentou `delete_meal_photo` (destrutiva, servida também no braço B) e a origem do
 * item (`source`) em `log_meal`, `add_meal_item` e `update_meal_item`: mudam os dois braços (B
 * passa a 44, 26 delas compartilhadas).
 * A #376 acrescentou cinco tools do plano alimentar (nenhuma destrutiva), e a revisão mudou a
 * descrição de `log_plan_meal` (repetir devolve o mesmo registro): muda o braço A.
 * A #375 acrescentou `nutrients` e `barcode` a `create_custom_food` e `update_custom_food`
 * (nenhuma das duas é destrutiva nem de intenção, mas a de entidade é servida nos dois braços):
 * mudam os dois.
 * A #378 acrescentou `set_exercise_favorite`, `favoritesOnly` em `search_exercise` e a
 * configuração do exercício em `add_exercise_to_plan` e `update_plan_exercise` (nenhuma
 * destrutiva nem de intenção): muda o braço A.
 * A #377 acrescentou a sensação e as respostas pós-treino a `finish_workout_session`: muda o
 * braço A. As duas chegaram juntas no merge da main na #378.
 * A #379 acrescentou cinco tools do aluno (plano recebido e agenda, nenhuma destrutiva nem de
 * intenção) e `weeks` em `create_training_block`: muda o braço A.
 * A #381 acrescentou `save_session_as_plan` (não destrutiva nem de intenção), `kind` em
 * `list_workout_sessions` e o treino livre na descrição de `start_workout_session`: muda o
 * braço A. A revisão da #381 disse na descrição de `save_session_as_plan` que ela é idempotente
 * por sessão e recusa a sessão aberta: muda o braço A.
 * A #380 acrescentou `log_circuit_result` e `circuit`/`exercises` em `create_workout_plan`
 * (nenhuma destrutiva nem de intenção): muda o braço A.
 * A revisão da #380 disse nas descrições de `log_circuit_result`, `finish_workout_session` e
 * `save_session_as_plan` as faixas do resultado e as recusas do circuito: muda o braço A.
 * A #382 acrescentou `get_consistency` (só leitura) e mudou as descrições de `get_streak`,
 * `list_achievements`, `list_personal_records` e `update_goal` (nenhuma de intenção): muda o
 * braço A. As duas chegaram juntas no merge da main na #382.
 * O merge da main (#382) na #380 juntou os dois braços A acima.
 * A #394 acrescentou `get_group_poll`, `vote_group_poll`, `list_blocked_users`, `block_user` e
 * `unblock_user` (nenhuma destrutiva nem de intenção), a enquete em `create_group_post` e
 * `filter` e o bloqueio em `list_group_posts`: muda o braço A.
 */

const SHA_ENTIDADE = '4d4c231b998f768b0849e8d7cb3a8cbb2d1360701776a354c6d908c466a37b06';
const SHA_INTENCAO = 'b46079a1e14e37752736709ce35d7203f98ca24106f3793cdab8160882b7c36e';

/** `json.dumps(valor, ensure_ascii=False, sort_keys=True)` do Python, byte a byte. */
function comoPython(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return `[${valor.map(comoPython).join(', ')}]`;
  if (typeof valor === 'object') {
    const chaves = Object.keys(valor as object).sort();
    return `{${chaves
      .map((k) => `${JSON.stringify(k)}: ${comoPython((valor as Record<string, unknown>)[k])}`)
      .join(', ')}}`;
  }
  return JSON.stringify(valor);
}

/** O `sha_do_catalogo` do runner: nome, descrição, schema e anotações, por nome. */
function shaDoCatalogo(tools: ToolServida[]): string {
  const canonico = [...tools]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
      annotations: t.annotations ?? {},
    }));
  return createHash('sha256').update(comoPython(canonico), 'utf8').digest('hex');
}

function config(valores: Record<string, string>): ConfigService {
  return { get: (nome: string) => valores[nome] } as unknown as ConfigService;
}

describe('superfície do /mcp', () => {
  describe('header', () => {
    it('é entidade quando ausente, e aceita os dois valores', () => {
      expect(superficieDoHeader(undefined)).toBe('entidade');
      expect(superficieDoHeader('entidade')).toBe('entidade');
      expect(superficieDoHeader('intencao')).toBe('intencao');
    });

    it.each([['intenção'], ['INTENCAO'], [''], [['entidade', 'intencao']]])(
      'recusa %j com 400, em vez de servir o recorte de sempre em silêncio',
      (valor) => {
        expect(() => superficieDoHeader(valor)).toThrow(BadRequestException);
      },
    );
  });

  describe('flag MCP_SUPERFICIE_INTENCAO', () => {
    it('nasce desligada', () => {
      expect(new SuperficieDeIntencao(config({})).habilitada()).toBe(false);
      expect(new SuperficieDeIntencao(config({ MCP_SUPERFICIE_INTENCAO: '0' })).habilitada()).toBe(
        false,
      );
    });

    it('liga fora de produção', () => {
      const ligada = new SuperficieDeIntencao(
        config({ MCP_SUPERFICIE_INTENCAO: '1', NODE_ENV: 'development' }),
      );
      expect(ligada.habilitada()).toBe(true);
    });

    it('recusa subir ligada com NODE_ENV=production', () => {
      expect(
        () =>
          new SuperficieDeIntencao(
            config({ MCP_SUPERFICIE_INTENCAO: 'true', NODE_ENV: 'production' }),
          ),
      ).toThrow(/production/);
    });

    it('com a flag desligada, o registry não serve a superfície de intenção', () => {
      const tools = carregarTools();
      const discovery = {
        getProviders: () => tools.map((instance) => ({ metatype: instance.constructor, instance })),
      };
      const registry = new McpToolRegistry(
        discovery as never,
        { record: () => undefined } as never,
        new SuperficieDeIntencao(config({})),
      );
      registry.onModuleInit();
      expect(() =>
        registry.bindAll({} as never, { userId: 'u', timezone: 'UTC' }, 'intencao'),
      ).toThrow(/desligada/);
    });

    it('com a flag desligada, o controller responde 400 antes de abrir o servidor MCP', async () => {
      const registry = { intencaoHabilitada: () => false } as unknown as McpToolRegistry;
      const controller = new McpController(
        registry,
        { touch: async () => undefined } as never,
        config({}),
      );
      const req = { headers: { [HEADER_SUPERFICIE]: 'intencao' } } as unknown as Request;
      await expect(
        controller.handle(req, {} as Response, { id: 'u', timezone: 'UTC' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('tools/list servido', () => {
    const registry = registryDeTeste();
    const todas = carregarTools();
    let entidade: ToolServida[];
    let intencao: ToolServida[];

    beforeAll(async () => {
      [entidade, intencao] = await Promise.all([
        catalogoServido('entidade', registry),
        catalogoServido('intencao', registry),
      ]);
    });

    it('sem header, serve o braço A de sempre — mesmo sha256 da linha de base', () => {
      expect(entidade).toHaveLength(todas.filter((t) => t.surface === undefined).length);
      expect(entidade.some((t) => INTENT_TOOLS.some((i) => i.name === t.name))).toBe(false);
      expect(shaDoCatalogo(entidade)).toBe(SHA_ENTIDADE);
    });

    it('com intencao, serve exatamente as de intenção e as de entidade iguais nos dois braços', () => {
      const esperadas = [
        ...INTENT_TOOLS.map((t) => t.name),
        ...todas
          .filter((t) => t.surface === undefined && isSharedWithIntentSurface(t))
          .map((t) => t.name),
      ].sort();
      expect(intencao.map((t) => t.name).sort()).toEqual(esperadas);
      expect(intencao).toHaveLength(44);
      expect(shaDoCatalogo(intencao)).toBe(SHA_INTENCAO);
    });

    it('serve as de entidade compartilhadas byte a byte iguais nas duas superfícies', () => {
      const compartilhadas = intencao.filter((t) => !INTENT_TOOLS.some((i) => i.name === t.name));
      expect(compartilhadas).toHaveLength(26);
      for (const tool of compartilhadas) {
        const naEntidade = entidade.find((t) => t.name === tool.name);
        expect(naEntidade).toEqual(tool);
      }
    });

    it('anuncia cada tool de intenção com o schema do contrato, sem cópia', () => {
      for (const spec of INTENT_TOOLS) {
        const servida = intencao.find((t) => t.name === spec.name);
        expect(servida?.description).toBe(spec.description);
        expect(Object.keys(servida?.inputSchema.properties ?? {}).sort()).toEqual(
          Object.keys(spec.inputSchema).sort(),
        );
      }
    });
  });
});
