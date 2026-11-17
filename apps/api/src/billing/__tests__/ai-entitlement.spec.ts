import { CARENCIA_DIAS, resolveAiEntitlement, type AssinaturaLida } from '../ai-entitlement';

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

describe('resolveAiEntitlement', () => {
  it('sem assinatura é Free, e não degradado', () => {
    expect(resolveAiEntitlement([], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'sem_assinatura',
      degraded: false,
      subscription: null,
    });
  });

  it('checkout aberto (PENDING) não dá direito, mas aparece como pendente', () => {
    expect(
      resolveAiEntitlement([assinatura({ status: 'PENDING', currentPeriodEnd: null })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'pendente', degraded: false, source: 'ASAAS' });
  });

  it('ACTIVE dentro do período é PRO', () => {
    expect(resolveAiEntitlement([assinatura({})], AGORA)).toMatchObject({
      tier: 'PRO',
      motivo: 'ativa',
      source: 'ASAAS',
    });
  });

  it('cancelada pelo app continua PRO até o fim do período', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ cancelAtPeriodEnd: true, currentPeriodEnd: dias(3) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'ativa' });
  });

  it('cancelada pelo app e com o período vencido vira Free degradado', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ cancelAtPeriodEnd: true, currentPeriodEnd: dias(-1) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'FREE', motivo: 'cancelada', degraded: true });
  });

  it('renovação a caminho (vencida há horas) não derruba o PRO', () => {
    const fim = new Date(AGORA.getTime() - 3 * 60 * 60 * 1000);
    expect(resolveAiEntitlement([assinatura({ currentPeriodEnd: fim })], AGORA)).toMatchObject({
      tier: 'PRO',
      motivo: 'ativa',
    });
  });

  it('renovação que não chegou vira carência, e depois Free — webhook perdido não dá PRO eterno', () => {
    expect(resolveAiEntitlement([assinatura({ currentPeriodEnd: dias(-3) })], AGORA)).toMatchObject(
      {
        tier: 'PRO',
        motivo: 'carencia',
      },
    );
    expect(
      resolveAiEntitlement([assinatura({ currentPeriodEnd: dias(-(CARENCIA_DIAS + 1)) })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'inadimplente', degraded: true });
  });

  it('PAST_DUE dentro da carência ainda é PRO; fora dela, Free degradado', () => {
    expect(
      resolveAiEntitlement([assinatura({ status: 'PAST_DUE', graceEndsAt: dias(2) })], AGORA),
    ).toMatchObject({ tier: 'PRO', motivo: 'carencia' });
    expect(
      resolveAiEntitlement([assinatura({ status: 'PAST_DUE', graceEndsAt: dias(-1) })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'inadimplente', degraded: true });
  });

  it('PAST_DUE sem data de carência usa o fim do período + a carência padrão', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ status: 'PAST_DUE', graceEndsAt: null, currentPeriodEnd: dias(-2) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'carencia' });
  });

  it('EXPIRED e CANCELED são Free degradado, e a tela sabe dizer qual', () => {
    expect(resolveAiEntitlement([assinatura({ status: 'EXPIRED' })], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'expirada',
      degraded: true,
    });
    expect(resolveAiEntitlement([assinatura({ status: 'CANCELED' })], AGORA)).toMatchObject({
      tier: 'FREE',
      motivo: 'cancelada',
      degraded: true,
    });
  });

  it('cortesia MANUAL sem prazo é PRO', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ source: 'MANUAL', interval: null, currentPeriodEnd: null })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', source: 'MANUAL' });
  });

  it('com duas assinaturas vale a ativa, e não a mais recente', () => {
    const vencida = assinatura({ id: 'velha', status: 'EXPIRED', createdAt: dias(-1) });
    const ativa = assinatura({ id: 'loja', source: 'APPLE', createdAt: dias(-30) });
    expect(resolveAiEntitlement([vencida, ativa], AGORA)).toMatchObject({
      tier: 'PRO',
      source: 'APPLE',
      subscription: { id: 'loja' },
    });
  });

  it('ativa vence carência, mesmo com a carência mais longa', () => {
    const carencia = assinatura({ id: 'atraso', status: 'PAST_DUE', graceEndsAt: dias(6) });
    const ativa = assinatura({ id: 'ok', currentPeriodEnd: dias(1) });
    expect(resolveAiEntitlement([carencia, ativa], AGORA).subscription?.id).toBe('ok');
  });

  it('um PENDING ao lado de um PRO ativo não esconde o PRO', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ id: 'p', status: 'PENDING', interval: 'YEARLY' }), assinatura({ id: 'a' })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', subscription: { id: 'a' } });
  });
});

describe('resolveAiEntitlement — assento de comunidade (ADR 025)', () => {
  const assento = (parcial: Partial<AssinaturaLida> = {}) =>
    assinatura({
      id: 'pool',
      source: 'GROUP',
      currentPeriodEnd: dias(30),
      group: { id: 'g1', name: 'Academia X' },
      ...parcial,
    });

  it('assento ativo dá PRO pela comunidade', () => {
    expect(resolveAiEntitlement([assento()], AGORA)).toMatchObject({
      tier: 'PRO',
      source: 'GROUP',
      subscription: { group: { name: 'Academia X' } },
    });
  });

  it('PRO próprio ativo vence o assento, mesmo terminando antes', () => {
    expect(
      resolveAiEntitlement(
        [assento(), assinatura({ id: 'meu', currentPeriodEnd: dias(2) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', source: 'ASAAS', subscription: { id: 'meu' } });
  });

  it('assento ativo vence o PRO próprio em carência', () => {
    const atraso = assinatura({ id: 'meu', status: 'PAST_DUE', graceEndsAt: dias(3) });
    expect(resolveAiEntitlement([atraso, assento()], AGORA)).toMatchObject({ source: 'GROUP' });
  });

  it('comunidade inadimplente: carência vale, depois volta ao Free', () => {
    expect(
      resolveAiEntitlement([assento({ status: 'PAST_DUE', graceEndsAt: dias(2) })], AGORA),
    ).toMatchObject({ tier: 'PRO', motivo: 'carencia' });
    expect(
      resolveAiEntitlement([assento({ status: 'PAST_DUE', graceEndsAt: dias(-1) })], AGORA),
    ).toMatchObject({ tier: 'FREE', degraded: true, source: 'GROUP' });
  });

  it('pool da comunidade ainda não pago não aparece como checkout da pessoa', () => {
    expect(
      resolveAiEntitlement([assento({ status: 'PENDING', currentPeriodEnd: null })], AGORA),
    ).toMatchObject({ tier: 'FREE', motivo: 'sem_assinatura', subscription: null });
  });

  it('cortesia de comunidade sem prazo (pool manual) dá PRO', () => {
    expect(resolveAiEntitlement([assento({ currentPeriodEnd: null })], AGORA)).toMatchObject({
      tier: 'PRO',
      source: 'GROUP',
    });
  });
});

describe('teste grátis (TRIALING, #386)', () => {
  it('dentro do teste é PRO, com o motivo "teste"', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ status: 'TRIALING', trialEndsAt: dias(3), currentPeriodEnd: dias(3) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'teste', degraded: false });
  });

  it('teste acabado há horas ainda é PRO: a conversão está a caminho', () => {
    const fim = new Date(AGORA.getTime() - 3 * 60 * 60 * 1000);
    expect(
      resolveAiEntitlement(
        [assinatura({ status: 'TRIALING', trialEndsAt: fim, currentPeriodEnd: fim })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', motivo: 'teste' });
  });

  it('teste acabado sem pagamento volta ao Free, sem carência', () => {
    expect(
      resolveAiEntitlement(
        [assinatura({ status: 'TRIALING', trialEndsAt: dias(-2), currentPeriodEnd: dias(-2) })],
        AGORA,
      ),
    ).toMatchObject({ tier: 'FREE', motivo: 'teste_acabou', degraded: true });
  });

  it('teste ao lado de um PENDING antigo: vale o teste', () => {
    expect(
      resolveAiEntitlement(
        [
          assinatura({ id: 'p', status: 'PENDING', currentPeriodEnd: null, createdAt: AGORA }),
          assinatura({
            id: 't',
            status: 'TRIALING',
            trialEndsAt: dias(4),
            currentPeriodEnd: dias(4),
          }),
        ],
        AGORA,
      ),
    ).toMatchObject({ tier: 'PRO', subscription: { id: 't' } });
  });
});

describe('PRO pela comunidade e por programa (#288, #386)', () => {
  const comunidade = (p: Partial<AssinaturaLida> = {}) =>
    assinatura({
      id: 'pool',
      source: 'GROUP',
      interval: 'MONTHLY',
      currentPeriodEnd: null,
      group: { id: 'g1', name: 'Academia Demo' },
      paidBy: 'COMMUNITY',
      ...p,
    });

  it('membro de comunidade ALL_MEMBERS tem PRO pago pela comunidade', () => {
    expect(resolveAiEntitlement([comunidade()], AGORA)).toMatchObject({
      tier: 'PRO',
      source: 'GROUP',
      subscription: { paidBy: 'COMMUNITY' },
    });
  });

  it('PRO próprio continua valendo sobre o da comunidade (ADR 025)', () => {
    expect(resolveAiEntitlement([comunidade(), assinatura({})], AGORA)).toMatchObject({
      source: 'ASAAS',
    });
  });

  it('programa vale até a data final e depois volta ao Free', () => {
    const programa = (fim: Date) =>
      comunidade({
        paidBy: 'PROGRAM',
        programName: 'Verão 21',
        currentPeriodEnd: fim,
        cancelAtPeriodEnd: true,
      });
    expect(resolveAiEntitlement([programa(dias(6))], AGORA)).toMatchObject({
      tier: 'PRO',
      subscription: { paidBy: 'PROGRAM', programName: 'Verão 21' },
    });
    expect(resolveAiEntitlement([programa(dias(-1))], AGORA)).toMatchObject({ tier: 'FREE' });
  });
});
