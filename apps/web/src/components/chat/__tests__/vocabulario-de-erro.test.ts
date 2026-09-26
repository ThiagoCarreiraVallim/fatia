import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ERROR_CODES, erroDoChat } from '@fatia/api-client';

/**
 * O vocabulário de erro do chat, conferido contra quem o emite (#247, #250).
 *
 * `packages/api-client/src/chat.ts` declarava `AI_PROVIDER_UNAVAILABLE`, que
 * **nenhuma camada emite**: provedor fora do ar chega como
 * `AI_PROVIDER_UNREACHABLE`, caía em `AI_UNKNOWN_ERROR`, e o ramo escrito para
 * ele era inalcançável — a #157 outra vez, o tipo do cliente descrevendo um
 * servidor que não existe.
 *
 * O caso lê `errors.py` em vez de repetir a lista à mão porque uma cópia aqui
 * envelheceria junto com a que envelheceu lá. Mora em `apps/web` e não no
 * `@fatia/api-client` porque aquele pacote é consumido como fonte pelo Expo e
 * pelo Next: dar `@types/node` a ele para um teste abriria a porta para `src/`
 * importar API de Node e só quebrar no aparelho.
 */

const HERE = __dirname;
/** Raiz do monorepo, subindo de `.../apps/web/src/components/chat/__tests__`. */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..', '..');
const AGENTE = resolve(REPO_ROOT, 'apps/agent/src/fatia_agent');

/** Os `code` que o agente declara num arquivo, lidos do fonte dele. */
function declarados(arquivo: string, prefixo: string): string[] {
  const fonte = readFileSync(resolve(AGENTE, arquivo), 'utf8');
  const achados = [...fonte.matchAll(new RegExp(`^\\s+code = "(${prefixo}[A-Z_]+)"`, 'gm'))].map(
    (m) => m[1],
  );
  return [...new Set(achados)];
}

/** Os `code` que o agente emite como erro de stream: provedor e `/mcp`. */
function codigosDoAgente(): string[] {
  // Os `MCP_TOOL_*` não chegam como erro de stream: viram resultado de tool com
  // falha, que o modelo lê e corrige. `MCP_ERROR` é a família, não é emitido.
  const mcp = declarados('chat/errors.py', 'MCP_').filter(
    (code) => !code.startsWith('MCP_TOOL_') && code !== 'MCP_ERROR',
  );
  return [...declarados('providers/errors.py', 'AI_'), ...mcp];
}

describe('vocabulário de erro do chat', () => {
  it('todo código que o agente emite chega inteiro — nenhum vira AI_UNKNOWN_ERROR', () => {
    const codigos = codigosDoAgente();
    // Se o arquivo mudar de forma, o caso não pode passar vazio.
    expect(codigos.length).toBeGreaterThan(5);

    // Foi o caso dos `MCP_*`: o agente os emitia, e a tela dizia "motivo não
    // identificado" para um token vencido.
    const perdidos = codigos.filter((code) => erroDoChat({ code }).code !== code);
    expect(perdidos).toEqual([]);
  });

  it('o cliente não declara código de provedor que nenhuma camada emite', () => {
    const doAgente = new Set(codigosDoAgente());
    const inventados = CHAT_ERROR_CODES.filter(
      (code) => /^AI_(PROVIDER|MODEL|ENDPOINT|RESPONSE)_/.test(code) && !doAgente.has(code),
    );
    expect(inventados).toEqual([]);
  });
});
