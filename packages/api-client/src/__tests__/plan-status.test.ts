import { describe, expect, it } from 'vitest';
import type { MyPlan } from '../billing';
import {
  planBadge,
  planOfferView,
  planStatusView,
  storeTermsText,
  webTermsText,
  type PlanStatusView,
  type PlanViewContext,
} from '../plan-status';

/**
 * A tela "Meu plano" (#386, pranchas Al-M2, Al-M5, Al-M13, Al-M13b/c/d e
 * Si-04) decidida num lugar só, com a regra das lojas: **o app nunca vende
 * fora da loja**. Sem compra no app, nenhum preço e nenhum link; a página de
 * pagamento do Asaas, o Pix e o boleto só aparecem na web.
 */
const NOW = new Date('2026-11-10T12:00:00Z');

const base: MyPlan = {
  tier: 'FREE',
  source: null,
  reason: 'sem_assinatura',
  degraded: false,
  state: 'FREE',
  status: null,
  interval: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  trialEligible: true,
  trialDays: 7,
  paymentMethod: null,
  paymentUrl: null,
  manageUrl: null,
  paidBy: null,
  groupName: null,
  programName: null,
  requiresPlan: true,
  webCheckout: true,
  prices: { monthlyCents: 1990, yearlyCents: 17900 },
};

const plan = (p: Partial<MyPlan>): MyPlan => ({ ...base, ...p });
const app = (canPurchase: boolean): PlanViewContext => ({ surface: 'app', canPurchase, now: NOW });
const web: PlanViewContext = { surface: 'web', canPurchase: true, now: NOW };

/** Tudo o que a tela escreve, para procurar preço, Pix e link. */
function allText(v: PlanStatusView): string {
  return [
    v.badge,
    v.via,
    v.title,
    v.body,
    v.note,
    v.why?.title,
    v.why?.body,
    v.featuresTitle,
    v.community?.title,
    v.community?.until,
    v.community?.program?.name,
    ...v.actions.map((a) => `${a.label} ${'url' in a ? a.url : ''}`),
  ]
    .filter(Boolean)
    .join(' ');
}

const PAGAR_FORA = /pix|boleto|R\$|asaas|https?:\/\/(?!apps\.apple|play\.google)/i;

const ASAAS_ATRASADA = plan({
  tier: 'PRO',
  source: 'ASAAS',
  reason: 'carencia',
  state: 'PAST_DUE',
  status: 'PAST_DUE',
  interval: 'MONTHLY',
  paymentMethod: 'PIX',
  currentPeriodEnd: '2026-11-05T03:00:00Z',
  graceEndsAt: '2026-11-12T03:00:00Z',
  paymentUrl: 'https://www.asaas.com/i/abc',
  paidBy: 'PERSONAL',
  trialEligible: false,
});

describe('planStatusView: a regra das lojas', () => {
  const casos: Array<[string, MyPlan]> = [
    ['Free', base],
    [
      'pendente',
      plan({
        reason: 'pendente',
        state: 'PENDING',
        source: 'ASAAS',
        status: 'PENDING',
        paymentMethod: 'BOLETO',
        paymentUrl: 'https://www.asaas.com/i/abc',
      }),
    ],
    ['atrasada', ASAAS_ATRASADA],
    [
      'vence em breve',
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        state: 'ACTIVE',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        paymentMethod: 'PIX',
        currentPeriodEnd: '2026-11-13T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        paidBy: 'PERSONAL',
      }),
    ],
    [
      'teste na web',
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'teste',
        state: 'TRIAL',
        status: 'TRIALING',
        interval: 'YEARLY',
        paymentMethod: 'PIX',
        trialEndsAt: '2026-11-14T12:00:00Z',
        currentPeriodEnd: '2026-11-14T12:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        paidBy: 'PERSONAL',
      }),
    ],
    [
      'expirada com cobrança aberta',
      plan({
        reason: 'expirada',
        state: 'EXPIRED',
        degraded: true,
        source: 'ASAAS',
        status: 'EXPIRED',
        currentPeriodEnd: '2026-11-01T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        trialEligible: false,
      }),
    ],
  ];

  it.each(casos)('%s no app, com ou sem compra: sem preço, sem Pix, sem link', (_, p) => {
    for (const iap of [true, false]) {
      const v = planStatusView(p, app(iap));
      expect(allText(v)).not.toMatch(PAGAR_FORA);
      expect(v.actions.map((a) => a.kind)).not.toContain('pay');
      expect(v.actions.map((a) => a.kind)).not.toContain('cancel');
      expect(v.offer).not.toBe('web');
    }
  });

  it('Free no app sem compra: "O PRO vem pela sua comunidade" e "Tenho código"', () => {
    const v = planStatusView(base, app(false));
    expect(v.offer).toBe('community');
    expect(v.actions).toEqual([{ kind: 'code', label: 'Tenho código' }]);
  });

  it('Free no app com compra: a oferta é da loja', () => {
    expect(planStatusView(base, app(true)).offer).toBe('store');
  });

  it('Free na web: a oferta é a assinatura pelo Asaas (quando a instância tem)', () => {
    expect(planStatusView(base, web).offer).toBe('web');
    expect(planStatusView(plan({ webCheckout: false }), web).offer).toBeNull();
  });

  it('instância sem exigência de plano: nada a vender', () => {
    const v = planStatusView(plan({ requiresPlan: false, source: 'INSTANCE', tier: 'PRO' }), web);
    expect(v.offer).toBeNull();
    expect(v.actions).toEqual([]);
  });
});

describe('planStatusView: os estados da web (M13b/c)', () => {
  it('pendente na web: "Abrir página de pagamento" e o prazo do Pix e do boleto', () => {
    const v = planStatusView(
      plan({
        reason: 'pendente',
        state: 'PENDING',
        source: 'ASAAS',
        status: 'PENDING',
        paymentMethod: 'BOLETO',
        paymentUrl: 'https://www.asaas.com/i/abc',
      }),
      web,
    );
    expect(v.badge).toBe('Pendente');
    expect(v.title).toBe('Aguardando o pagamento');
    expect(v.actions).toContainEqual({
      kind: 'pay',
      label: 'Abrir página de pagamento',
      url: 'https://www.asaas.com/i/abc',
    });
    expect(v.note).toBe('Pix cai na hora · boleto em até 2 dias úteis');
  });

  it('pendente no app: "Você assinou fora do app", sem link', () => {
    const v = planStatusView(
      plan({
        reason: 'pendente',
        state: 'PENDING',
        source: 'ASAAS',
        status: 'PENDING',
        paymentUrl: 'https://www.asaas.com/i/abc',
      }),
      app(true),
    );
    expect(v.title).toBe('Pagamento em confirmação');
    expect(v.body).toMatch(/fora do app/);
    expect(v.actions).toEqual([]);
  });

  it('vence em 3 dias (Pix): avisa e oferece pagar', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        state: 'ACTIVE',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        paymentMethod: 'PIX',
        currentPeriodEnd: '2026-11-13T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        paidBy: 'PERSONAL',
      }),
      web,
    );
    expect(v.badge).toBe('Vence em breve');
    expect(v.title).toBe('Seu PRO vence em 3 dias');
    expect(v.body).toBe('R$ 19,90 · vence 13 nov. Pague com Pix ou boleto para não pausar a IA.');
    expect(v.actions[0]).toEqual({
      kind: 'pay',
      label: 'Pagar com Pix',
      url: 'https://www.asaas.com/i/abc',
    });
  });

  it('cartão também recebe "vence em breve": o Fatia não sabe se o cartão está salvo', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        state: 'ACTIVE',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        paymentMethod: 'CREDIT_CARD',
        currentPeriodEnd: '2026-11-13T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        paidBy: 'PERSONAL',
      }),
      web,
    );
    expect(v.badge).toBe('Vence em breve');
    expect(v.actions.map((a) => a.kind)).toEqual(['pay', 'cancel']);
  });

  it('carência na web: faltam 2 dias para a IA pausar, com o link de pagamento', () => {
    const v = planStatusView(ASAAS_ATRASADA, web);
    expect(v.badge).toBe('Carência');
    expect(v.title).toBe('Faltam 2 dias para a IA pausar');
    expect(v.body).toBe('Depois de 12 nov a IA pausa. Seu registro e seu histórico continuam.');
    expect(v.actions[0]?.kind).toBe('pay');
    expect(v.featuresOn).toBe(true);
  });

  it('venceu hoje na web: 7 dias de carência', () => {
    const v = planStatusView(
      {
        ...ASAAS_ATRASADA,
        currentPeriodEnd: '2026-11-10T03:00:00Z',
        graceEndsAt: '2026-11-17T03:00:00Z',
      },
      web,
    );
    expect(v.title).toBe('Seu PRO venceu hoje');
    expect(v.body).toBe('Você tem 7 dias de carência. Nada muda até lá.');
  });

  it('carência no app: "Mandamos por e-mail como resolver", sem botão', () => {
    const v = planStatusView(ASAAS_ATRASADA, app(true));
    expect(v.badge).toBe('Atrasada');
    expect(v.title).toBe('Pagamento não passou');
    expect(v.body).toBe(
      'Você segue com PRO até 12 nov (carência). Mandamos por e-mail como resolver. Depois volta ao Free, sem perder nada.',
    );
    expect(v.actions).toEqual([]);
  });

  it('IA pausada na web, com a cobrança aberta: pagar volta na hora', () => {
    const v = planStatusView(
      plan({
        reason: 'expirada',
        state: 'EXPIRED',
        degraded: true,
        source: 'ASAAS',
        status: 'EXPIRED',
        paymentMethod: 'PIX',
        currentPeriodEnd: '2026-11-01T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        trialEligible: false,
      }),
      web,
    );
    expect(v.badge).toBe('IA pausada');
    expect(v.title).toBe('A IA pausou');
    expect(v.actions[0]?.kind).toBe('pay');
    expect(v.featuresOn).toBe(false);
  });

  it('ativa na web: preço, forma de pagamento e cancelar', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        state: 'ACTIVE',
        status: 'ACTIVE',
        interval: 'YEARLY',
        paymentMethod: 'BOLETO',
        currentPeriodEnd: '2026-12-04T03:00:00Z',
        paidBy: 'PERSONAL',
      }),
      web,
    );
    expect(v.title).toBe('PRO anual · renova em 4 dez');
    expect(v.via).toBe('Web · boleto');
    expect(v.body).toMatch(/^R\$ 179,00 por ano/);
    expect(v.actions).toEqual([{ kind: 'cancel', label: 'Cancelar assinatura' }]);
  });

  it('ativa pela web vista no app: o estado e as datas, sem preço nem gestão', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        state: 'ACTIVE',
        status: 'ACTIVE',
        interval: 'YEARLY',
        paymentMethod: 'BOLETO',
        currentPeriodEnd: '2026-12-04T03:00:00Z',
        paidBy: 'PERSONAL',
      }),
      app(true),
    );
    expect(v.title).toBe('PRO anual · renova em 4 dez');
    expect(v.via).toBe('Fora do app · anual');
    expect(v.actions).toEqual([]);
  });
});

describe('planStatusView: a loja (M13, M13d)', () => {
  const LOJA = plan({
    tier: 'PRO',
    source: 'APPLE',
    reason: 'ativa',
    state: 'ACTIVE',
    status: 'ACTIVE',
    interval: 'YEARLY',
    currentPeriodEnd: '2026-12-04T03:00:00Z',
    manageUrl: 'https://apps.apple.com/account/subscriptions',
    paidBy: 'PERSONAL',
    trialEligible: false,
  });

  it('ativa: cancelar nas assinaturas da loja até 24 h antes', () => {
    const v = planStatusView(LOJA, app(true));
    expect(v.via).toBe('Apple · anual');
    expect(v.body).toBe('Renova sozinho. Cancele nas assinaturas da loja até 24 h antes de 4 dez.');
    expect(v.actions).toEqual([
      {
        kind: 'store',
        label: 'Cancelar nas assinaturas da loja',
        url: 'https://apps.apple.com/account/subscriptions',
      },
    ]);
  });

  it('a loja não conseguiu cobrar: atualizar na loja, e por que não dá para pagar aqui', () => {
    for (const ctx of [app(true), app(false), web]) {
      const v = planStatusView(
        {
          ...LOJA,
          reason: 'carencia',
          state: 'PAST_DUE',
          status: 'PAST_DUE',
          interval: 'MONTHLY',
          graceEndsAt: '2026-11-17T03:00:00Z',
        },
        ctx,
      );
      expect(v.badge).toBe('Pagamento pendente');
      expect(v.title).toBe('A loja não conseguiu cobrar');
      expect(v.body).toBe(
        'Atualize o pagamento na App Store. Enquanto isso, seu PRO segue até 17 nov.',
      );
      expect(v.actions).toEqual([
        {
          kind: 'store',
          label: 'Abrir assinaturas da App Store',
          url: 'https://apps.apple.com/account/subscriptions',
        },
      ]);
      expect(v.why?.title).toBe('Por que não dá para pagar aqui?');
      expect(allText(v)).not.toMatch(/pix|boleto|asaas/i);
    }
  });

  it('Google Play com falha de cobrança fala do Google Play', () => {
    const v = planStatusView(
      {
        ...LOJA,
        source: 'GOOGLE',
        reason: 'carencia',
        state: 'PAST_DUE',
        status: 'PAST_DUE',
        graceEndsAt: '2026-11-17T03:00:00Z',
        manageUrl: 'https://play.google.com/store/account/subscriptions',
      },
      app(true),
    );
    expect(v.actions[0]?.label).toBe('Abrir assinaturas do Google Play');
  });

  it('cancelada na loja: PRO até o fim do período', () => {
    const v = planStatusView({ ...LOJA, state: 'CANCELED', cancelAtPeriodEnd: true }, app(true));
    expect(v.badge).toBe('Cancelada');
    expect(v.title).toBe('PRO até 4 dez');
  });
});

describe('planStatusView: teste grátis', () => {
  it('teste da loja: faltam N dias, cancelar na loja', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'GOOGLE',
        reason: 'teste',
        state: 'TRIAL',
        status: 'TRIALING',
        interval: 'YEARLY',
        trialEndsAt: '2026-11-13T12:00:00Z',
        currentPeriodEnd: '2026-11-13T12:00:00Z',
        manageUrl: 'https://play.google.com/store/account/subscriptions',
        paidBy: 'PERSONAL',
        trialEligible: false,
      }),
      app(true),
    );
    expect(v.badge).toBe('Teste · 3 dias');
    expect(v.title).toBe('Teste grátis até 13 nov');
    expect(v.actions[0]?.kind).toBe('store');
  });

  it('teste da web, na web: a primeira cobrança e o cancelar', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'teste',
        state: 'TRIAL',
        status: 'TRIALING',
        interval: 'YEARLY',
        paymentMethod: 'CREDIT_CARD',
        trialEndsAt: '2026-11-14T12:00:00Z',
        currentPeriodEnd: '2026-11-14T12:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        paidBy: 'PERSONAL',
        trialEligible: false,
      }),
      web,
    );
    // O Fatia nunca recebe o cartão: nada é cobrado sozinho no fim do teste.
    expect(v.body).toBe(
      'Para continuar, pague a primeira cobrança de R$ 179,00 por ano até 14 nov, com cartão, na página de pagamento. Sem pagamento, volta ao Free e nada é cobrado.',
    );
    expect(v.actions.map((a) => a.kind)).toEqual(['pay', 'cancel']);
    expect(v.actions[1]?.label).toBe('Cancelar o teste');
  });
});

describe('planStatusView: voltar ao PRO na web sem beco sem saída (revisão #386)', () => {
  it('IA pausada com a cobrança aberta: pagar ou assinar de novo, com o formulário', () => {
    const v = planStatusView(
      plan({
        reason: 'expirada',
        state: 'EXPIRED',
        degraded: true,
        source: 'ASAAS',
        status: 'PAST_DUE',
        paymentMethod: 'PIX',
        currentPeriodEnd: '2026-10-01T03:00:00Z',
        paymentUrl: 'https://www.asaas.com/i/abc',
        trialEligible: false,
      }),
      web,
    );
    expect(v.actions.map((a) => a.kind)).toEqual(['pay', 'subscribe']);
    expect(v.offer).toBe('web');
  });

  it('teste cancelado que já acabou: volta ao Free com a oferta da web', () => {
    const v = planStatusView(
      plan({
        reason: 'teste_acabou',
        state: 'FREE',
        source: 'ASAAS',
        status: 'TRIALING',
        cancelAtPeriodEnd: true,
        trialEndsAt: '2026-11-08T12:00:00Z',
        currentPeriodEnd: '2026-11-08T12:00:00Z',
        paymentUrl: null,
        trialEligible: false,
      }),
      web,
    );
    expect(v.offer).toBe('web');
  });
});

describe('planStatusView: teste cancelado', () => {
  it('nada será cobrado, o PRO vai até o fim do teste e não há o que cancelar de novo', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'teste',
        state: 'CANCELED',
        status: 'TRIALING',
        cancelAtPeriodEnd: true,
        interval: 'MONTHLY',
        trialEndsAt: '2026-11-14T12:00:00Z',
        currentPeriodEnd: '2026-11-14T12:00:00Z',
        paidBy: 'PERSONAL',
        trialEligible: false,
      }),
      web,
    );
    expect(v.title).toBe('PRO até 14 nov');
    expect(v.body).toBe(
      'Você cancelou o teste. Nada será cobrado; o PRO segue até o fim do teste.',
    );
    expect(v.actions).toEqual([]);
  });
});

describe('planStatusView: PRO pela comunidade (M5)', () => {
  it('como membro: enquanto você for membro', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'GROUP',
        reason: 'ativa',
        state: 'ACTIVE',
        paidBy: 'COMMUNITY',
        groupName: 'Academia Demo',
        trialEligible: false,
      }),
      app(false),
    );
    expect(v.community).toEqual({
      title: 'Seu PRO é pago pela Academia Demo',
      until: 'Enquanto você for membro',
      program: null,
    });
    expect(v.body).toBe('Se sair, volta ao Free sem perder nada.');
    expect(v.actions).toEqual([{ kind: 'open-ai', label: 'Abrir a IA' }]);
  });

  it('por programa: o nome, o fim e os dias que faltam', () => {
    const v = planStatusView(
      plan({
        tier: 'PRO',
        source: 'GROUP',
        reason: 'ativa',
        state: 'ACTIVE',
        paidBy: 'PROGRAM',
        groupName: 'Academia Demo',
        programName: 'Programa Verão 21',
        // O que `billing:grant-group --until 2026-11-16` grava: o fim do dia 16 em São Paulo.
        currentPeriodEnd: '2026-11-17T02:59:59.999Z',
        cancelAtPeriodEnd: true,
        trialEligible: false,
      }),
      app(false),
    );
    expect(v.community?.until).toBe('Durante o Programa Verão 21');
    expect(v.community?.program).toEqual({
      name: 'Programa Verão 21',
      until: '16/11',
      daysLeft: 6,
    });
    expect(v.badge).toBe('PRO · Comunidade');
  });
});

describe('planOfferView (M2)', () => {
  it('quem pode testar vê "Começar 7 dias grátis"', () => {
    expect(planOfferView(base).cta).toBe('Começar 7 dias grátis');
    expect(planOfferView(base).trialDays).toBe(7);
  });

  it('quem já testou vê "Assinar PRO"', () => {
    const o = planOfferView(plan({ trialEligible: false }));
    expect(o.cta).toBe('Assinar PRO');
    expect(o.trialDays).toBe(0);
  });

  it('instância sem teste (0 dias) vê "Assinar PRO"', () => {
    expect(planOfferView(plan({ trialDays: 0 })).cta).toBe('Assinar PRO');
  });

  it('os dois planos com o preço da web, o anual com o desconto', () => {
    expect(planOfferView(base).options).toEqual([
      { interval: 'YEARLY', title: 'Anual', price: 'R$ 179,00', per: 'R$ 14,92/mês', tag: '−25%' },
      { interval: 'MONTHLY', title: 'Mensal', price: 'R$ 19,90', per: 'sem fidelidade', tag: null },
    ]);
  });
});

describe('textos das condições', () => {
  it('loja (M2/M3): grátis por N dias, depois o preço; cancela até 24 h antes', () => {
    expect(storeTermsText({ trialDays: 7, price: 'R$ 179,99', interval: 'YEARLY' })).toBe(
      '7 dias grátis, depois R$ 179,99 por ano. Renova sozinho; cancele nas assinaturas da loja até 24 h antes do fim do período.',
    );
    expect(storeTermsText({ trialDays: 0, price: 'R$ 19,99', interval: 'MONTHLY' })).toBe(
      'R$ 19,99 por mês. Renova sozinho; cancele nas assinaturas da loja até 24 h antes do fim do período.',
    );
  });

  it('web (Si-04): renova sozinho, o PRO vale até o fim do período pago', () => {
    expect(webTermsText(7)).toBe(
      '7 dias grátis; a primeira cobrança vence no fim do teste. Renova sozinho. Cancele quando quiser: o PRO vale até o fim do período pago.',
    );
    expect(webTermsText(0)).toBe(
      'Renova sozinho. Cancele quando quiser: o PRO vale até o fim do período pago.',
    );
  });
});

describe('planBadge (o selo do Você)', () => {
  it('Free, PRO e o teste com os dias que faltam', () => {
    expect(planBadge(base, NOW)).toEqual({ label: 'Free', tone: 'free' });
    expect(planBadge(plan({ tier: 'PRO', state: 'ACTIVE' }), NOW)).toEqual({
      label: 'PRO',
      tone: 'pro',
    });
    expect(
      planBadge(plan({ tier: 'PRO', state: 'TRIAL', trialEndsAt: '2026-11-11T12:00:00Z' }), NOW),
    ).toEqual({ label: 'Teste · 1 dia', tone: 'trial' });
  });

  it('PRO na carência ganha o tom de atenção', () => {
    expect(planBadge(plan({ tier: 'PRO', state: 'PAST_DUE' }), NOW)).toEqual({
      label: 'PRO',
      tone: 'warn',
    });
  });
});
