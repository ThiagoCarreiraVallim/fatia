import { SEM_IA, decideAiTier, type AssinaturaParaTier } from '../ai-tier';

const AGORA = new Date('2026-08-03T12:00:00Z');
const assinatura = (parcial: Partial<AssinaturaParaTier>): AssinaturaParaTier => ({
  status: 'ACTIVE',
  tier: 'premium',
  ...parcial,
});

describe('decideAiTier', () => {
  it('entrega a faixa contratada de quem está em dia', () => {
    expect(decideAiTier(assinatura({ status: 'ACTIVE' }), AGORA)).toEqual({
      tier: 'premium',
      degraded: false,
      motivo: 'ativa',
    });
    expect(decideAiTier(assinatura({ status: 'TRIALING' }), AGORA).tier).toBe('premium');
  });

  it('mantém a faixa enquanto a carência não vence', () => {
    // Boleto compensa em dias úteis e webhook atrasa: degradar no dia do
    // vencimento puniria a academia pela latência do meio de pagamento.
    const decisao = decideAiTier(
      assinatura({ status: 'PAST_DUE', gracePeriodEndsAt: new Date('2026-08-10T00:00:00Z') }),
      AGORA,
    );

    expect(decisao).toEqual({ tier: 'premium', degraded: false, motivo: 'carencia' });
  });

  it('degrada a inadimplência vencida em vez de bloquear', () => {
    const vencida = decideAiTier(
      assinatura({ status: 'PAST_DUE', gracePeriodEndsAt: new Date('2026-07-30T00:00:00Z') }),
      AGORA,
    );

    expect(vencida).toEqual({ tier: SEM_IA, degraded: true, motivo: 'inadimplente' });
    // `'none'` é um nível de IA, não um erro e não um bloqueio: é o valor que
    // quem chama compara, e não algo que ele precise capturar.
    expect(vencida.tier).toBe('none');
  });

  it('degrada inadimplência sem carência configurada', () => {
    expect(decideAiTier(assinatura({ status: 'PAST_DUE' }), AGORA).tier).toBe(SEM_IA);
    expect(
      decideAiTier(assinatura({ status: 'PAST_DUE', gracePeriodEndsAt: null }), AGORA).tier,
    ).toBe(SEM_IA);
  });

  it('trata cancelamento e ausência de assinatura como sem IA patrocinada', () => {
    expect(decideAiTier(assinatura({ status: 'CANCELED' }), AGORA).tier).toBe(SEM_IA);
    expect(decideAiTier(null, AGORA)).toEqual({
      tier: SEM_IA,
      degraded: false,
      motivo: 'sem_assinatura',
    });
    expect(decideAiTier(undefined, AGORA).tier).toBe(SEM_IA);
  });

  it('nunca lança — nem com status que este deploy não conhece', () => {
    // O caminho real: alguém adiciona um status no banco e um pod antigo o lê.
    // Se isso virasse exceção numa rota de aluno, a inadimplência da academia
    // teria virado bloqueio dele sem ninguém decidir isso.
    const desconhecido = { status: 'SUSPENSO_JUDICIALMENTE', tier: 'premium' };

    expect(() => decideAiTier(desconhecido as unknown as AssinaturaParaTier, AGORA)).not.toThrow();
    expect(decideAiTier(desconhecido as unknown as AssinaturaParaTier, AGORA).tier).toBe(SEM_IA);

    for (const lixo of [{}, { status: null }, { tier: 42 }]) {
      expect(() => decideAiTier(lixo as unknown as AssinaturaParaTier, AGORA)).not.toThrow();
    }
  });

  it('decide pelo instante recebido, sem depender do relógio da máquina', () => {
    const assinaturaEmCarencia = assinatura({
      status: 'PAST_DUE',
      gracePeriodEndsAt: new Date('2026-08-05T00:00:00Z'),
    });

    expect(decideAiTier(assinaturaEmCarencia, new Date('2026-08-04T23:59:00Z')).degraded).toBe(
      false,
    );
    expect(decideAiTier(assinaturaEmCarencia, new Date('2026-08-05T00:01:00Z')).degraded).toBe(
      true,
    );
  });
});
