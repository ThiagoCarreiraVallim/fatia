import { ehOAgente } from '../agente';

/**
 * A chave que faz o `/mcp` servir as tools só do agente (`agentOnly`). O que
 * importa aqui é o lado de fora: sem chave na instância, ninguém é o agente.
 */
describe('ehOAgente', () => {
  it('reconhece a chave igual à da instância', () => {
    expect(ehOAgente('segredo-do-agente', 'segredo-do-agente')).toBe(true);
  });

  it('recusa chave diferente, inclusive do mesmo tamanho', () => {
    expect(ehOAgente('segredo-do-agentX', 'segredo-do-agente')).toBe(false);
    expect(ehOAgente('segredo', 'segredo-do-agente')).toBe(false);
  });

  it('instância sem chave não tem agente, e header vazio não vira passe livre', () => {
    expect(ehOAgente('', '')).toBe(false);
    expect(ehOAgente('qualquer', '')).toBe(false);
    expect(ehOAgente('qualquer', '   ')).toBe(false);
  });

  it('header ausente ou repetido não é o agente', () => {
    expect(ehOAgente(undefined, 'segredo')).toBe(false);
    expect(ehOAgente(['segredo', 'segredo'], 'segredo')).toBe(false);
  });
});
