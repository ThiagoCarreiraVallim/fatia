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
 * isso não aconteça sem alguém ver. O de intenção é o do braço B congelado.
 */

const SHA_ENTIDADE = 'ef9e15550d55d996b0de6cdc5b29c819ddf74a0a59a2353e179e36841b9edcd4';
const SHA_INTENCAO = '25531e4c78dea4b4578f742e0dc7a7db7624956ece67c43b04315280a9ea8a37';

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
      const controller = new McpController(registry);
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
      expect(intencao).toHaveLength(40);
      expect(shaDoCatalogo(intencao)).toBe(SHA_INTENCAO);
    });

    it('serve as de entidade compartilhadas byte a byte iguais nas duas superfícies', () => {
      const compartilhadas = intencao.filter((t) => !INTENT_TOOLS.some((i) => i.name === t.name));
      expect(compartilhadas).toHaveLength(22);
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
