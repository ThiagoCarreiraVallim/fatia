import { leArgumentos } from '../billing-dry-run';

/**
 * O comando existe para o dono conferir dinheiro antes de ele virar dinheiro.
 * Um argumento mal lido aqui não quebra nada: imprime uma conta errada com toda
 * a confiança de uma conta certa, que é o pior desfecho possível para uma
 * ferramenta de conferência.
 */
describe('leArgumentos', () => {
  const completo = ['--group', 'g1', '--price', '1500', '--cycle-day', '1'];

  it('lê o que precisa e assume a faixa não informada', () => {
    expect(leArgumentos(completo)).toEqual({
      group: 'g1',
      price: 1500,
      cycleDay: 1,
      tier: 'nao-informada',
      at: undefined,
    });
  });

  it('recusa valor vazio em vez de tratá-lo como zero', () => {
    // `Number('')` é `0` e passa por `Number.isFinite`. Sem guarda, `--price ""`
    // simula a fatura inteira a R$ 0,00 sem reclamar de nada, e `--cycle-day ""`
    // vira `0` e morre com stack de RangeError em vez da mensagem de uso.
    expect(() => leArgumentos(['--group', 'g1', '--price', '', '--cycle-day', '1'])).toThrow(
      /uso:/,
    );
    expect(() => leArgumentos(['--group', 'g1', '--price', '1500', '--cycle-day', ''])).toThrow(
      /uso:/,
    );
    // Espaço em branco é a mesma coisa: `Number('  ')` também é `0`.
    expect(() => leArgumentos(['--group', 'g1', '--price', '   ', '--cycle-day', '1'])).toThrow(
      /uso:/,
    );
  });

  it('recusa argumento obrigatório ausente ou não numérico', () => {
    expect(() => leArgumentos(['--price', '1500', '--cycle-day', '1'])).toThrow(/uso:/);
    expect(() => leArgumentos(['--group', 'g1', '--cycle-day', '1'])).toThrow(/uso:/);
    expect(() => leArgumentos(['--group', 'g1', '--price', 'mil', '--cycle-day', '1'])).toThrow(
      /uso:/,
    );
  });

  it('aceita faixa e instante de referência quando vierem', () => {
    const args = leArgumentos([...completo, '--tier', 'basico', '--at', '2026-09-01T12:00:00Z']);
    expect(args.tier).toBe('basico');
    expect(args.at?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });
});
