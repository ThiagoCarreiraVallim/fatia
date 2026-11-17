import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { artifactFor } from '../mcp-tool.registry';
import { registryDeTeste } from './support/catalogo-servido';
import { TOOL_RESULT_SAMPLES } from './support/tool-result-samples';

/**
 * Todo formato declarado vira cartão (#384).
 *
 * Declarar `card` não desenha nada: quem desenha é o produtor (`artifact()` da tool, ou o
 * genérico de Tabela e Lista), e um formato sem produtor passava verde aqui enquanto a tela
 * nunca mostrava o cartão. Por isso cada tool do catálogo do chat com formato de consulta roda
 * pelo mesmo caminho do registry sobre um resultado de verdade dela (`tool-result-samples.ts`),
 * e o artefato tem de sair no formato declarado com o campo que o agente exige.
 *
 * A lista de tools sai do registry, não daqui: tool nova sem amostra ou sem produtor reprova.
 */

const ARTEFATOS_PY = resolve(__dirname, '../../../../agent/src/fatia_agent/chat/artefatos.py');

/** O campo obrigatório de cada formato, lido do agente (`CAMPO_OBRIGATORIO`), que descarta o resto. */
function requiredFieldByKind(): Record<string, string> {
  const fonte = readFileSync(ARTEFATOS_PY, 'utf8');
  const bloco = /CAMPO_OBRIGATORIO = \{([\s\S]*?)\n\}/.exec(fonte)?.[1] ?? '';
  return Object.fromEntries(
    Array.from(bloco.matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g), (m) => [m[1], m[2]]),
  );
}

const REQUIRED = requiredFieldByKind();
const registry = registryDeTeste();
const catalogo = registry.catalogoDoChat();

/** Toda tool com formato de consulta — leitura, e a confirmável cujo resultado vira cartão. */
const comCartao = Object.entries(catalogo)
  .filter(([, entrada]) => entrada.card && entrada.card !== 'confirm')
  .map(([nome, entrada]) => [nome, entrada.card as string] as const)
  .sort(([a], [b]) => a.localeCompare(b));

describe('todo formato declarado vira cartão (#384)', () => {
  it('lê os campos obrigatórios do agente', () => {
    expect(REQUIRED).toMatchObject({ metric: 'value', bars: 'bars', file: 'url' });
  });

  it('acha as tools com formato no catálogo do chat', () => {
    expect(comCartao.length).toBeGreaterThan(50);
  });

  it('não sobra amostra de tool que não declara formato', () => {
    const nomes = new Set(comCartao.map(([nome]) => nome));
    expect(Object.keys(TOOL_RESULT_SAMPLES).filter((n) => !nomes.has(n))).toEqual([]);
  });

  it.each(comCartao)('%s → %s', (nome, card) => {
    const amostra = TOOL_RESULT_SAMPLES[nome];
    if (!amostra) throw new Error(`${nome} declara '${card}' e não tem amostra de resultado`);
    const tool = registry.buscar(nome);
    expect(tool).toBeDefined();

    const artefato = artifactFor(tool!, amostra.result, amostra.input);

    expect(artefato).not.toBeNull();
    expect(artefato?.kind).toBe(card);
    const campo = REQUIRED[card];
    expect(campo).toBeDefined();
    const valor = artefato?.[campo];
    if (card === 'metric') expect(typeof valor).toBe('number');
    else if (card === 'file') expect(typeof valor === 'string' && valor.length > 0).toBe(true);
    else {
      expect(Array.isArray(valor)).toBe(true);
      expect((valor as unknown[]).length).toBeGreaterThan(0);
    }
  });
});
