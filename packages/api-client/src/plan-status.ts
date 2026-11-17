import type { BillingInterval, MyPlan, PaymentMethod } from './billing';
import { MONTHS_SHORT } from './format';
import { formatBRL, yearlyPerMonthLabel } from './plan';

/**
 * A tela "Meu plano" (#386; pranchas Al-M2, Al-M5, Al-M13, Al-M13b/c/d e
 * Si-04), decidida aqui para o PWA e o app dizerem o mesmo — e para a regra
 * das lojas ficar num lugar só, testada:
 *
 * - **O app nunca vende fora da loja.** No app não sai preço do Asaas, Pix,
 *   boleto, link de pagamento nem "cancelar" da assinatura da web. Sem compra
 *   no app (`canPurchase` falso), a oferta é "O PRO vem pela sua comunidade".
 * - A assinatura feita na web, vista no app, mostra o estado e as datas — o
 *   que a pessoa já tem —, sem botão: quem resolve é o e-mail ou a web
 *   (prancha Al-M13: "Você assinou fora do app").
 * - Quem assina pela loja resolve na loja, nas duas superfícies (Al-M13d).
 */

export type PlanSurface = 'app' | 'web';

export interface PlanViewContext {
  surface: PlanSurface;
  /** Dá para comprar aqui? No app, só com a compra pela loja ligada. */
  canPurchase: boolean;
  now: Date;
}

export type PlanAction =
  /** Página da cobrança do Asaas. Só na web. */
  | { kind: 'pay'; label: string; url: string }
  /** Assinaturas da App Store / Google Play. */
  | { kind: 'store'; label: string; url: string }
  /** Cancelar a assinatura da web. Só na web. */
  | { kind: 'cancel'; label: string }
  /** Ir para a oferta (loja no app, Asaas na web). */
  | { kind: 'subscribe'; label: string }
  /** Entrar numa comunidade com o código. */
  | { kind: 'code'; label: string }
  | { kind: 'open-ai'; label: string };

/** O tom do selo, no vocabulário da prancha (`bCls`). */
export type PlanTone = 'pro' | 'trial' | 'warn' | 'mute' | 'free';

export interface PlanStatusView {
  badge: string;
  tone: PlanTone;
  /** "Apple · anual", "Web · Pix", "Fora do app · anual". */
  via: string | null;
  title: string;
  body: string;
  /** Linha miúda sob o botão ("Pix cai na hora · boleto em até 2 dias úteis"). */
  note: string | null;
  /** "Por que não dá para pagar aqui?" da assinatura da loja (Al-M13d). */
  why: { title: string; body: string } | null;
  /** Título da lista de recursos de IA e se eles estão ligados. */
  featuresTitle: string;
  featuresOn: boolean;
  actions: PlanAction[];
  /** A oferta abaixo do cartão: da loja, da web, da comunidade ou nenhuma. */
  offer: 'store' | 'web' | 'community' | null;
  /** O cartão do PRO pago pela comunidade (Al-M5). */
  community: {
    title: string;
    until: string;
    program: { name: string; until: string; daysLeft: number } | null;
  } | null;
}

const TZ = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;

const STORE_NAME = { APPLE: 'App Store', GOOGLE: 'Google Play' } as const;
const STORE_VIA = { APPLE: 'Apple', GOOGLE: 'Google Play' } as const;
const METHOD = { PIX: 'Pix', BOLETO: 'boleto', CREDIT_CARD: 'cartão' } as const;
const PAY_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pagar com Pix',
  BOLETO: 'Pagar o boleto',
  CREDIT_CARD: 'Pagar com cartão',
};
const PIX_E_BOLETO = 'Pix cai na hora · boleto em até 2 dias úteis';
const WHY_STORE = {
  title: 'Por que não dá para pagar aqui?',
  body: 'Quem assina pela loja paga pela loja. O Fatia não vê nem guarda seu cartão.',
};

/** "2026-12-04" no fuso de São Paulo. */
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

/** "4 dez", no fuso de São Paulo, como nas pranchas. */
function day(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = ymd(new Date(iso)).split('-');
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]}`;
}

/** "30/11", como no cartão do programa (Al-M5). */
function dayNum(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Dias de calendário em São Paulo entre hoje e `iso` (negativo = passou). */
function calendarDays(iso: string, now: Date): number {
  const a = Date.parse(`${ymd(now)}T00:00:00Z`);
  const b = Date.parse(`${ymd(new Date(iso))}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

const days = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const perInterval = (i: BillingInterval | null) => (i === 'YEARLY' ? 'por ano' : 'por mês');
const intervalWord = (i: BillingInterval | null) =>
  i === 'YEARLY' ? 'anual' : i === 'MONTHLY' ? 'mensal' : null;

function priceOf(plan: MyPlan): string {
  return formatBRL(plan.interval === 'YEARLY' ? plan.prices.yearlyCents : plan.prices.monthlyCents);
}

function proTitle(plan: MyPlan): string {
  const tipo = intervalWord(plan.interval);
  return tipo ? `PRO ${tipo}` : 'PRO';
}

/** De onde vem a assinatura, sem nunca dizer "web" ou "Asaas" no app. */
function viaOf(plan: MyPlan, ctx: PlanViewContext): string | null {
  const tipo = intervalWord(plan.interval);
  if (plan.source === 'APPLE' || plan.source === 'GOOGLE') {
    return [STORE_VIA[plan.source], tipo].filter(Boolean).join(' · ');
  }
  if (plan.source === 'ASAAS') {
    if (ctx.surface === 'app') return ['Fora do app', tipo].filter(Boolean).join(' · ');
    return plan.paymentMethod ? `Web · ${METHOD[plan.paymentMethod]}` : 'Web';
  }
  if (plan.source === 'MANUAL') return 'Cortesia';
  return null;
}

/** A oferta para quem não tem PRO, conforme a superfície. */
function offerOf(plan: MyPlan, ctx: PlanViewContext): PlanStatusView['offer'] {
  if (!plan.requiresPlan) return null;
  if (ctx.surface === 'app') return ctx.canPurchase ? 'store' : 'community';
  return plan.webCheckout ? 'web' : null;
}

function noPurchaseActions(offer: PlanStatusView['offer']): PlanAction[] {
  return offer === 'community' ? [{ kind: 'code', label: 'Tenho código' }] : [];
}

function view(p: Partial<PlanStatusView> & Pick<PlanStatusView, 'badge' | 'title' | 'body'>) {
  return {
    tone: 'pro' as PlanTone,
    via: null,
    note: null,
    why: null,
    featuresTitle: 'Seu PRO inclui',
    featuresOn: true,
    actions: [],
    offer: null,
    community: null,
    ...p,
  } satisfies PlanStatusView;
}

export function planStatusView(plan: MyPlan, ctx: PlanViewContext): PlanStatusView {
  const web = ctx.surface === 'web';
  const store = plan.source === 'APPLE' || plan.source === 'GOOGLE' ? plan.source : null;
  const asaas = plan.source === 'ASAAS';
  // O link da cobrança: só na web, só da assinatura da web.
  const pay = (label?: string): PlanAction[] =>
    web && asaas && plan.paymentUrl
      ? [
          {
            kind: 'pay',
            label:
              label ??
              (plan.paymentMethod ? PAY_LABEL[plan.paymentMethod] : 'Abrir página de pagamento'),
            url: plan.paymentUrl,
          },
        ]
      : [];
  const manage = (label: string): PlanAction[] =>
    store && plan.manageUrl ? [{ kind: 'store', label, url: plan.manageUrl }] : [];

  if (plan.source === 'INSTANCE' || !plan.requiresPlan) {
    return view({
      badge: 'Liberado',
      title: 'IA liberada nesta instância',
      body: 'Nesta instância a IA do Fatia é liberada para todos.',
    });
  }

  // PRO pago pela comunidade (Al-M5): a pessoa não paga, não renova, não cancela.
  if (plan.tier === 'PRO' && plan.source === 'GROUP') {
    const quem = plan.groupName ?? 'sua comunidade';
    const program =
      plan.paidBy === 'PROGRAM' && plan.currentPeriodEnd
        ? {
            name: plan.programName ?? 'Programa',
            until: dayNum(plan.currentPeriodEnd),
            daysLeft: Math.max(0, calendarDays(plan.currentPeriodEnd, ctx.now)),
          }
        : null;
    const atrasada = plan.state === 'PAST_DUE';
    return view({
      badge: atrasada ? 'Atrasada' : 'PRO · Comunidade',
      tone: atrasada ? 'warn' : 'pro',
      title: `Seu PRO é pago pela ${quem}`,
      body: atrasada
        ? `O pagamento da comunidade está em atraso. A IA segue até ${day(plan.graceEndsAt)}; quem resolve é a equipe.`
        : 'Se sair, volta ao Free sem perder nada.',
      featuresTitle: program ? `PRO até ${program.until}` : 'Seu PRO inclui',
      actions: [{ kind: 'open-ai', label: 'Abrir a IA' }],
      community: {
        title: `Seu PRO é pago pela ${quem}`,
        until:
          plan.paidBy === 'PROGRAM'
            ? `Durante o ${plan.programName ?? 'programa'}`
            : 'Enquanto você for membro',
        program,
      },
    });
  }

  switch (plan.state) {
    case 'TRIAL': {
      const fim = plan.trialEndsAt ?? plan.currentPeriodEnd;
      const left = fim ? Math.max(0, calendarDays(fim, ctx.now)) : 0;
      const base = {
        badge: `Teste · ${days(left)}`,
        tone: 'trial' as const,
        via: viaOf(plan, ctx),
        title: `Teste grátis até ${day(fim)}`,
        featuresTitle: 'Liberados no teste',
      };
      if (store) {
        return view({
          ...base,
          body: `Depois, a loja renova sozinha. Cancele nas assinaturas da loja até 24 h antes de ${day(fim)} e não paga nada.`,
          actions: manage('Cancelar nas assinaturas da loja'),
        });
      }
      if (web) {
        const metodo = plan.paymentMethod
          ? plan.paymentMethod === 'CREDIT_CARD'
            ? ' no cartão'
            : ` no ${METHOD[plan.paymentMethod]}`
          : '';
        return view({
          ...base,
          body: `Depois, ${priceOf(plan)} ${perInterval(plan.interval)}${metodo}. Cancele antes de ${day(fim)} e não paga nada.`,
          actions: [
            ...pay('Abrir página de pagamento'),
            { kind: 'cancel', label: 'Cancelar o teste' },
          ],
          note: plan.paymentMethod === 'CREDIT_CARD' ? null : PIX_E_BOLETO,
        });
      }
      return view({
        ...base,
        body: `Você começou o teste fora do app. Avisamos por e-mail antes de ${day(fim)}.`,
      });
    }

    case 'PENDING':
      if (web) {
        return view({
          badge: 'Pendente',
          tone: 'trial',
          via: viaOf(plan, ctx),
          title: 'Aguardando o pagamento',
          body:
            plan.paymentMethod === 'CREDIT_CARD'
              ? 'Confirmando com o banco do cartão. Esta tela e o app atualizam sozinhos.'
              : 'Pague na página do Asaas. Esta tela e o app atualizam sozinhos quando confirmar.',
          note: plan.paymentMethod === 'CREDIT_CARD' ? null : PIX_E_BOLETO,
          actions: pay('Abrir página de pagamento'),
          featuresTitle: 'Libera quando confirmar',
          featuresOn: false,
        });
      }
      return view({
        badge: 'Pendente',
        tone: 'trial',
        via: 'Fora do app',
        title: 'Pagamento em confirmação',
        body: 'Você assinou fora do app. Avisamos por e-mail quando confirmar; esta tela atualiza sozinha.',
        featuresTitle: 'Libera quando confirmar',
        featuresOn: false,
      });

    case 'PAST_DUE': {
      if (store) {
        return view({
          badge: 'Pagamento pendente',
          tone: 'warn',
          via: viaOf(plan, ctx),
          title: 'A loja não conseguiu cobrar',
          body: `Atualize o pagamento na ${STORE_NAME[store]}. Enquanto isso, seu PRO segue até ${day(plan.graceEndsAt)}.`,
          actions: manage(
            `Abrir assinaturas ${store === 'APPLE' ? 'da App Store' : 'do Google Play'}`,
          ),
          note: store === 'APPLE' ? 'No Android: Google Play → Pagamentos e assinaturas' : null,
          why: WHY_STORE,
          featuresTitle: `Ativos até ${day(plan.graceEndsAt)}`,
        });
      }
      if (!web) {
        return view({
          badge: 'Atrasada',
          tone: 'warn',
          via: viaOf(plan, ctx),
          title: 'Pagamento não passou',
          body: `Você segue com PRO até ${day(plan.graceEndsAt)} (carência). Mandamos por e-mail como resolver. Depois volta ao Free, sem perder nada.`,
          featuresTitle: 'Ativos na carência',
        });
      }
      const late = plan.currentPeriodEnd ? -calendarDays(plan.currentPeriodEnd, ctx.now) : 1;
      const left = plan.graceEndsAt ? Math.max(0, calendarDays(plan.graceEndsAt, ctx.now)) : 0;
      const common = {
        tone: 'warn' as const,
        via: viaOf(plan, ctx),
        note: plan.paymentMethod === 'CREDIT_CARD' ? null : PIX_E_BOLETO,
        actions: pay(),
      };
      if (late <= 0) {
        return view({
          ...common,
          badge: 'Venceu',
          title: 'Seu PRO venceu hoje',
          body: `Você tem ${days(left)} de carência. Nada muda até lá.`,
          featuresTitle: 'Ativos na carência',
        });
      }
      if (left <= 2) {
        return view({
          ...common,
          badge: 'Carência',
          title: `Faltam ${days(left)} para a IA pausar`,
          body: `Depois de ${day(plan.graceEndsAt)} a IA pausa. Seu registro e seu histórico continuam.`,
          featuresTitle: `Ativos até ${day(plan.graceEndsAt)}`,
        });
      }
      return view({
        ...common,
        badge: 'Atrasada',
        title: 'Pagamento não passou',
        body: `Você segue com PRO até ${day(plan.graceEndsAt)} (carência). Depois volta ao Free, sem perder nada.`,
        featuresTitle: 'Ativos na carência',
      });
    }

    case 'CANCELED':
      return view({
        badge: 'Cancelada',
        tone: 'mute',
        via: viaOf(plan, ctx),
        title: `PRO até ${day(plan.currentPeriodEnd)}`,
        body: store
          ? 'Você cancelou na loja. Ela não cobra de novo; o PRO segue até o fim do período.'
          : 'Você cancelou. Não cobramos de novo; o PRO segue até o fim do período.',
        actions: manage('Reativar nas assinaturas da loja'),
        featuresTitle: `Ativos até ${day(plan.currentPeriodEnd)}`,
      });

    case 'ACTIVE': {
      if (plan.source === 'MANUAL') {
        return view({
          badge: 'Ativa',
          via: 'Cortesia',
          title: plan.currentPeriodEnd ? `PRO até ${day(plan.currentPeriodEnd)}` : 'PRO',
          body: 'Cortesia do Fatia. Depois volta ao Free, sem perder nada.',
        });
      }
      const fim = plan.currentPeriodEnd;
      const title = fim ? `${proTitle(plan)} · renova em ${day(fim)}` : proTitle(plan);
      if (store) {
        return view({
          badge: 'Ativa',
          via: viaOf(plan, ctx),
          title,
          body: `Renova sozinho. Cancele nas assinaturas da loja até 24 h antes de ${day(fim)}.`,
          actions: manage('Cancelar nas assinaturas da loja'),
        });
      }
      if (!web) {
        return view({
          badge: 'Ativa',
          via: viaOf(plan, ctx),
          title,
          body: 'Você assinou fora do app. Avisamos por e-mail antes de cada vencimento.',
        });
      }
      const dueIn = fim ? calendarDays(fim, ctx.now) : null;
      // Pix e boleto são pagos à mão: três dias antes, a tela lembra (Al-M13b).
      if (
        dueIn !== null &&
        dueIn >= 0 &&
        dueIn <= 3 &&
        plan.paymentMethod !== 'CREDIT_CARD' &&
        !plan.cancelAtPeriodEnd
      ) {
        return view({
          badge: 'Vence em breve',
          tone: 'trial',
          via: viaOf(plan, ctx),
          title: dueIn === 0 ? 'Seu PRO vence hoje' : `Seu PRO vence em ${days(dueIn)}`,
          body: `${priceOf(plan)} · vence ${day(fim)}. Pague com Pix ou boleto para não pausar a IA.`,
          note: PIX_E_BOLETO,
          actions: [...pay(), { kind: 'cancel', label: 'Cancelar assinatura' }],
        });
      }
      const metodo = plan.paymentMethod ? `, no ${METHOD[plan.paymentMethod]}` : '';
      return view({
        badge: 'Ativa',
        via: viaOf(plan, ctx),
        title,
        body: `${priceOf(plan)} ${perInterval(plan.interval)}${metodo}, renova sozinho. Cancele quando quiser: o PRO vale até o fim do período pago.`,
        actions: [{ kind: 'cancel', label: 'Cancelar assinatura' }],
      });
    }

    case 'EXPIRED': {
      const offer = offerOf(plan, ctx);
      // A cobrança ainda está aberta no Asaas: pagar religa a IA na hora (Al-M13b).
      if (web && asaas && plan.paymentUrl) {
        return view({
          badge: 'IA pausada',
          tone: 'mute',
          via: viaOf(plan, ctx),
          title: 'A IA pausou',
          body: 'Seu registro continua normal. Pague e a IA volta na hora.',
          note: plan.paymentMethod === 'CREDIT_CARD' ? null : PIX_E_BOLETO,
          actions: pay(),
          featuresTitle: 'Pausados',
          featuresOn: false,
        });
      }
      return view({
        badge: 'Expirada',
        tone: 'free',
        via: plan.currentPeriodEnd ? `Terminou em ${day(plan.currentPeriodEnd)}` : null,
        title: 'Seu PRO acabou',
        body: 'Tudo que você registrou continua aqui.',
        featuresTitle: 'Voltam com o PRO',
        featuresOn: false,
        offer,
        actions:
          offer === 'store' || offer === 'web'
            ? [{ kind: 'subscribe', label: 'Voltar ao PRO' }]
            : noPurchaseActions(offer),
      });
    }

    default: {
      const offer = offerOf(plan, ctx);
      return view({
        badge: 'Free',
        tone: 'free',
        title: 'Free',
        body: 'Registro manual, metas e MCP seguem grátis.',
        featuresTitle: 'O PRO acrescenta',
        featuresOn: false,
        offer,
        actions: noPurchaseActions(offer),
      });
    }
  }
}

export interface PlanOfferOption {
  interval: BillingInterval;
  title: string;
  price: string;
  per: string;
  tag: string | null;
}

export interface PlanOfferView {
  /** Dias de teste que a pessoa ainda pode usar (0 = já usou ou não há). */
  trialDays: number;
  cta: string;
  /** Preços da web (Asaas). No app, os preços são os da loja. */
  options: PlanOfferOption[];
}

/** A oferta do PRO (Al-M2 e Si-04). */
export function planOfferView(plan: MyPlan): PlanOfferView {
  const trialDays = plan.trialEligible ? plan.trialDays : 0;
  const cheio = plan.prices.monthlyCents * 12;
  const desconto =
    cheio > plan.prices.yearlyCents ? Math.round((1 - plan.prices.yearlyCents / cheio) * 100) : 0;
  return {
    trialDays,
    cta: trialDays > 0 ? `Começar ${days(trialDays)} grátis` : 'Assinar PRO',
    options: [
      {
        interval: 'YEARLY',
        title: 'Anual',
        price: formatBRL(plan.prices.yearlyCents),
        per: yearlyPerMonthLabel(plan.prices),
        tag: desconto > 0 ? `−${desconto}%` : null,
      },
      {
        interval: 'MONTHLY',
        title: 'Mensal',
        price: formatBRL(plan.prices.monthlyCents),
        per: 'sem fidelidade',
        tag: null,
      },
    ],
  };
}

/** As condições da compra na loja (Al-M2/M3), com o preço que a loja mostra. */
export function storeTermsText(p: {
  trialDays: number;
  price: string;
  interval: BillingInterval;
}): string {
  const preco = `${p.price} ${perInterval(p.interval)}`;
  const inicio = p.trialDays > 0 ? `${days(p.trialDays)} grátis, depois ${preco}` : preco;
  return `${inicio}. Renova sozinho; cancele nas assinaturas da loja até 24 h antes do fim do período.`;
}

/** As condições da assinatura pela web (Si-04). */
export function webTermsText(trialDays: number): string {
  const fim = 'Renova sozinho. Cancele quando quiser: o PRO vale até o fim do período pago.';
  return trialDays > 0
    ? `${days(trialDays)} grátis; a primeira cobrança vence no fim do teste. ${fim}`
    : fim;
}
