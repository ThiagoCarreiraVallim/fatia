import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEVER_RAN } from '../historico';
import { NOT_RUN_PREFIX, REFUSED_PREFIX } from '../partes';

/**
 * Os dois desfechos que o agente escreve em texto e a tela reconhece pelo texto.
 *
 * Mudar a frase lá sem mudar aqui faria a recusa da pessoa aparecer como "não deu
 * certo" — uma falha que não aconteceu. O teste lê o arquivo do agente, porque o
 * PWA não importa Python.
 */
const GRAFO = resolve(__dirname, '../../../../../agent/src/fatia_agent/chat/graph.py');

function constante(nome: string): string {
  const fonte = readFileSync(GRAFO, 'utf8');
  const achada = new RegExp(`^${nome} = "([^"]+)"`, 'm').exec(fonte);
  if (!achada) throw new Error(`${nome} não encontrada em graph.py`);
  return achada[1];
}

describe('contrato dos desfechos de tool com o agente', () => {
  it('a recusa começa com o que a tela procura', () => {
    expect(constante('RECUSADA').startsWith(REFUSED_PREFIX)).toBe(true);
  });

  it('a não executada começa com o que a tela procura', () => {
    expect(constante('NAO_EXECUTADA').startsWith(NOT_RUN_PREFIX)).toBe(true);
  });

  it('o "não executada" que a tela escreve é o mesmo do agente', () => {
    expect(NEVER_RAN).toBe(constante('NAO_EXECUTADA'));
  });
});
