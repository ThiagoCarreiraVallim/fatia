import { CARENCIA_DIAS, resolverDireitoIa, type AssinaturaLida } from '../ai-entitlement';

/**
 * A matriz do direito à IA (ADR 024). Cada linha é um estado que o webhook (ou
 * a falta dele) pode deixar no banco, e o que a pessoa tem de ver.
 */
const AGORA = new Date('2026-10-15T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const dias = (n: number) => new Date(AGORA.getTime() + n * DIA);

function assinatura(parcial: Partial<AssinaturaLida>): AssinaturaLida {
  return {
    id: 's1',
    source: 'ASAAS',
    status: 'ACTIVE',
    interval: 'MONTHLY',
    currentPeriodEnd: dias(20),
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    createdAt: dias(-10),
    ...parcial,
  };
}

describe('resolverDireitoIa', () => {
  it('sem assinatura é Free, e não degradado', () => {
    expect(resolverDireitoIa([], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'sem_assinatura',
      degraded: false,
      subscription: null,
    });
  });

  it('checkout aberto (PENDING) não dá direito, mas aparece como pendente', () => {
    expect(
      resolverDireitoIa([assinatura({ status: 'PENDING', currentPeriodEnd: null })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'pendente', degraded: false, source: 'ASAAS' });
  });

  it('ACTIVE dentro do período é PRO', () => {
    expect(resolverDireitoIa([assinatura({})], AGORA)).toMatchObject({
      tier: 'PRO',
      motivo: 'ativa',
      source: 'ASAAS',
    });
  });

  it('cancelada pelo app continua PRO até o fim do período', () => {
    expect(
      resolverDireitoIa(
        [assinatura({ cancelAtPeriodEnd: true, currentPeriodEnd: dias(3) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'ativa' });
  });

  it('cancelada pelo app e com o período vencido vira Free degradado', () => {
    expect(
      resolverDireitoIa(
        [assinatura({ cancelAtPeriodEnd: true, currentPeriodEnd: dias(-1) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'FREE', motivo: 'cancelada', degraded: true });
  });

  it('renovação a caminho (vencida há horas) não derruba o PRO', () => {
    const fim = new Date(AGORA.getTime() - 3 * 60 * 60 * 1000);
    expect(resolverDireitoIa([assinatura({ currentPeriodEnd: fim })], AGORA)).toMatchObject({
      tier: 'PRO',
      motivo: 'ativa',
    });
  });

  it('renovação que não chegou vira carência, e depois Free — webhook perdido não dá PRO eterno', () => {
    expect(resolverDireitoIa([assinatura({ currentPeriodEnd: dias(-3) })], AGORA)).toMatchObject({
      tier: 'PRO',
      motivo: 'carencia',
    });
    expect(
      resolverDireitoIa([assinatura({ currentPeriodEnd: dias(-(CARENCIA_DIAS + 1)) })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'inadimplente', degraded: true });
  });

  it('PAST_DUE dentro da carência ainda é PRO; fora dela, Free degradado', () => {
    expect(
      resolverDireitoIa([assinatura({ status: 'PAST_DUE', graceEndsAt: dias(2) })], AGORA),
    ).toMatchObject({ tier: 'PRO', motivo: 'carencia' });
    expect(
      resolverDireitoIa([assinatura({ status: 'PAST_DUE', graceEndsAt: dias(-1) })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'inadimplente', degraded: true });
  });

  it('PAST_DUE sem data de carência usa o fim do período + a carência padrão', () => {
    expect(
      resolverDireitoIa(
        [assinatura({ status: 'PAST_DUE', graceEndsAt: null, currentPeriodEnd: dias(-2) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'carencia' });
  });

  it('EXPIRED e CANCELED são Free degradado, e a tela sabe dizer qual', () => {
    expect(resolverDireitoIa([assinatura({ status: 'EXPIRED' })], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'expirada',
      degraded: true,
    });
    expect(resolverDireitoIa([assinatura({ status: 'CANCELED' })], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'cancelada',
      degraded: true,
    });
  });

  it('cortesia MANUAL sem prazo é PRO', () => {
    expect(
      resolverDireitoIa(
        [assinatura({ source: 'MANUAL', interval: null, currentPeriodEnd: null })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', source: 'MANUAL' });
  });

  it('com duas assinaturas vale a ativa, e não a mais recente', () => {
    const vencida = assinatura({ id: 'velha', status: 'EXPIRED', createdAt: dias(-1) });
    const ativa = assinatura({ id: 'loja', source: 'APPLE', createdAt: dias(-30) });
    expect(resolverDireitoIa([vencida, ativa], AGORA)).toMatchObject({
      tier: 'PRO',
      source: 'APPLE',
      subscription: { id: 'loja' },
    });
  });

  it('ativa vence carência, mesmo com a carência mais longa', () => {
    const carencia = assinatura({ id: 'atraso', status: 'PAST_DUE', graceEndsAt: dias(6) });
    const ativa = assinatura({ id: 'ok', currentPeriodEnd: dias(1) });
    expect(resolverDireitoIa([carencia, ativa], AGORA).subscription?.id).toBe('ok');
  });

  it('um PENDING ao lado de um PRO ativo não esconde o PRO', () => {
    expect(
      resolverDireitoIa(
        [assinatura({ id: 'p', status: 'PENDING', interval: 'YEARLY' }), assinatura({ id: 'a' })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', subscription: { id: 'a' } });
  });
});
