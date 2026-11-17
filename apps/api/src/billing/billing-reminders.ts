import type {
  BillingInterval,
  BillingReminderKind,
  PaymentMethod,
  SubscriptionSource,
  SubscriptionStatus,
} from '@prisma/client';
import type { EmailMessage } from '../notifications/email.service';
import { addDaysIso, dateInTz } from '../progress/helpers/date-tz';
import { CARENCIA_DIAS } from './ai-entitlement';

/**
 * Os avisos de cobrança e de fim do teste (#386, prancha Ex-03), puros: qual
 * sai hoje e com que texto. Quem manda, uma vez só, é o `BillingReminderJob`.
 *
 * A sequência acompanha a carência de 7 dias (`CARENCIA_DIAS`), só na
 * assinatura da web (Asaas): 3 dias antes do vencimento, no dia, +2 ("faltam
 * 5"), +5 ("faltam 2") e +7 (a IA pausou), em qualquer forma de pagamento:
 * o Fatia não vê se o cartão ficou salvo no Asaas. No teste da web, o fim (dia
 * 5) e o "vence hoje" do último dia: a primeira fatura é paga à mão.
 *
 * Assinatura da loja (Apple, Google) **nunca** recebe cobrança nem lembrete do
 * Fatia: só "atualize na loja" quando a RevenueCat indica falha de cobrança.
 * O aviso de fim do teste vale para os dois, porque é o que a tela do teste
 * promete (`Al-M3`, "Dia 5 · avisamos que o teste está acabando"); na loja ele
 * só diz onde cancelar.
 */

/** As datas de vencimento são do Asaas, no fuso dele. */
const FUSO = 'America/Sao_Paulo';
/** O fim do teste é avisado com 2 dias de antecedência (dia 5 de 7). */
const AVISO_DO_TESTE_DIAS = 2;

export interface ReminderSubscription {
  source: SubscriptionSource;
  status: SubscriptionStatus;
  paymentMethod: PaymentMethod | null;
  interval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface DueReminder {
  kind: BillingReminderKind;
  /** O vencimento (ou o fim do teste) a que o aviso se refere: a chave de idempotência. */
  dueDate: string;
}

/**
 * O fuso da pessoa, ou São Paulo quando o gravado não é um fuso IANA válido:
 * um `User.timezone` ruim não pode derrubar a rodada dos avisos.
 */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return FUSO;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return FUSO;
  }
}

/** Dias de `de` até `ate`, as duas datas `YYYY-MM-DD`. */
function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  });
  return Math.round((b - a) / 86_400_000);
}

/** O aviso que vale hoje para esta assinatura, ou `null`. */
export function billingReminderFor(
  sub: ReminderSubscription,
  now: Date,
  timeZone: string = FUSO,
): DueReminder | null {
  // "Hoje" é o dia da pessoa, no fuso dela: a oeste de São Paulo, o dia de lá
  // vira depois. O vencimento continua sendo a data do Asaas (São Paulo).
  const fuso = safeTimeZone(timeZone);
  const hoje = dateInTz(now, fuso);

  if (sub.status === 'TRIALING') {
    const fim = sub.trialEndsAt ?? sub.currentPeriodEnd;
    if (!fim || sub.cancelAtPeriodEnd || sub.source === 'MANUAL') return null;
    // O fim do teste é um instante: o dia dele é o da pessoa.
    const dia = dateInTz(fim, fuso);
    const faltam = diasEntre(hoje, dia);
    if (faltam === AVISO_DO_TESTE_DIAS) return { kind: 'TRIAL_ENDING', dueDate: dia };
    // Na web, a primeira fatura vence no fim do teste e ninguém a paga sozinho
    // (o Fatia nunca recebe o cartão): no último dia, "vence hoje".
    if (faltam === 0 && sub.source === 'ASAAS') return { kind: 'DUE_TODAY', dueDate: dia };
    return null;
  }

  if (sub.source === 'APPLE' || sub.source === 'GOOGLE') {
    if (sub.status !== 'PAST_DUE' || !sub.currentPeriodEnd) return null;
    return { kind: 'STORE_BILLING_ISSUE', dueDate: dateInTz(sub.currentPeriodEnd, FUSO) };
  }

  if (sub.source !== 'ASAAS' || sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) return null;
  if (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE') return null;

  const vencimento = dateInTz(sub.currentPeriodEnd, FUSO);
  // Pagar adianta o `currentPeriodEnd`: passado do vencimento = não pago.
  const atraso = diasEntre(vencimento, hoje);
  // Cartão também: o Fatia não vê se o cartão ficou salvo no Asaas.
  const kind: BillingReminderKind | null =
    atraso === -3
      ? 'DUE_SOON'
      : atraso === 0
        ? 'DUE_TODAY'
        : atraso === 2
          ? 'GRACE_5_LEFT'
          : atraso === 5
            ? 'GRACE_2_LEFT'
            : atraso === CARENCIA_DIAS
              ? 'AI_PAUSED'
              : null;
  return kind ? { kind, dueDate: vencimento } : null;
}

// ---------------------------------------------------------------- textos

export interface ReminderContext {
  priceCents: number;
  interval: BillingInterval | null;
  /** Endereço da web do aluno: o e-mail leva ao "Meu plano" de lá. */
  webUrl: string;
}

export interface ReminderTexts {
  /** Push e central: sem preço, sem forma de pagamento, sem link (regra das lojas). */
  push: { title: string; body: string; url: string };
  email: Omit<EmailMessage, 'to'>;
}

const LOJA = {
  APPLE: { nome: 'App Store', url: 'https://apps.apple.com/account/subscriptions' },
  GOOGLE: { nome: 'Google Play', url: 'https://play.google.com/store/account/subscriptions' },
} as const;

const NOTA_DA_LOJA = 'Assinatura feita pela loja? Atualize na App Store ou no Google Play.';

function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/\u00a0/g, ' ');
}

function dia(d: Date | string | null): string {
  if (!d) return 'o fim do período';
  const data = typeof d === 'string' ? new Date(`${d}T15:00:00Z`) : d;
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: FUSO })
    .format(data)
    .replace('.', '');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** O e-mail da prancha Ex-03: título, texto, um botão e a nota. */
function emailEx03(p: {
  subject: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  note: string;
}): Omit<EmailMessage, 'to'> {
  const text = [p.text, '', `${p.cta}: ${p.href}`, '', p.note].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#e9e9e6;font-family:Manrope,Arial,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px">
<tr><td style="padding:24px 32px;border-bottom:1px solid #eeeeee;font-size:17px;font-weight:800">Fatia</td></tr>
<tr><td style="padding:24px 32px 0;font-size:26px;line-height:1.15;font-weight:700">${escapeHtml(p.title)}</td></tr>
<tr><td style="padding:14px 32px 0;font-size:15px;line-height:1.55;color:#444444">${escapeHtml(p.text)}</td></tr>
<tr><td style="padding:18px 32px 0"><a href="${escapeHtml(p.href)}" style="display:inline-block;padding:14px 26px;border-radius:12px;font-weight:800;text-decoration:none;background:#2ce500;color:#0b1a05">${escapeHtml(p.cta)}</a></td></tr>
<tr><td style="padding:14px 32px 32px;font-size:13px;color:#777777">${escapeHtml(p.note)}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #eeeeee;font-size:12px;color:#777777">Fatia · fat.ia.br · Você recebe este e-mail porque tem conta no Fatia.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: p.subject, text, html };
}

/** Push e e-mail de um aviso. */
export function billingReminderTexts(
  kind: BillingReminderKind,
  sub: ReminderSubscription,
  ctx: ReminderContext,
): ReminderTexts {
  const planoUrl = `${ctx.webUrl.replace(/\/+$/, '')}/plan`;
  const preco = brl(ctx.priceCents);
  const plano = ctx.interval === 'YEARLY' ? 'anual' : 'mensal';
  const vence = dia(sub.currentPeriodEnd);
  const carencia = dia(
    sub.graceEndsAt ??
      (sub.currentPeriodEnd
        ? addDaysIso(dateInTz(sub.currentPeriodEnd, FUSO), CARENCIA_DIAS)
        : null),
  );
  const push = (title: string, body: string) => ({ title, body, url: '/plan' });
  const loja = sub.source === 'APPLE' || sub.source === 'GOOGLE' ? LOJA[sub.source] : null;

  switch (kind) {
    case 'TRIAL_ENDING': {
      const fim = dia(sub.trialEndsAt ?? sub.currentPeriodEnd);
      if (loja) {
        // Decisão da revisão da #386: o aviso fica (a prancha Al-M3 promete), mas
        // é da loja: nada de preço, link ou instrução de pagamento do Fatia, só
        // "se não quiser continuar, cancele na loja" com o link da tela dela.
        return {
          push: push(
            'Seu teste acaba em 2 dias',
            'Se não quiser continuar, cancele nas assinaturas da loja.',
          ),
          email: emailEx03({
            subject: 'Seu teste do PRO acaba em 2 dias',
            title: 'Seu teste acaba em 2 dias',
            text: `Seu teste do PRO acaba em ${fim}. Se não quiser continuar, cancele nas assinaturas da ${loja.nome} antes disso.`,
            cta: `Abrir assinaturas da ${loja.nome}`,
            href: loja.url,
            note: 'Cancelando, você volta ao Free e não perde nada.',
          }),
        };
      }
      return {
        push: push('Seu teste acaba em 2 dias', 'Mandamos por e-mail como continuar no PRO.'),
        email: emailEx03({
          subject: 'Seu teste do PRO acaba em 2 dias',
          title: 'Seu teste acaba em 2 dias',
          // Nada é cobrado sozinho: o Fatia nunca recebe o cartão.
          text: `Para continuar no PRO, pague a primeira cobrança de ${preco} (plano ${plano}) até ${fim}, com Pix, boleto ou cartão, na página de pagamento.`,
          cta: 'Abrir pagamento',
          href: planoUrl,
          note: 'Sem pagamento, você volta ao Free e não perde nada.',
        }),
      };
    }
    case 'DUE_SOON':
      return {
        push: push('Seu PRO vence em 3 dias', 'Mandamos por e-mail como pagar.'),
        email: emailEx03({
          subject: 'Seu PRO vence em 3 dias',
          title: 'Seu PRO vence em 3 dias',
          text: `${preco} · vence em ${vence}. Pague com Pix, boleto ou cartão na página de pagamento para não pausar a IA.`,
          cta: 'Abrir pagamento',
          href: planoUrl,
          note: 'Pix cai na hora · boleto em até 2 dias úteis · cartão já salvo é cobrado sozinho.',
        }),
      };
    case 'DUE_TODAY':
      if (sub.status === 'TRIALING') {
        // Teste sem pagamento não tem carência: volta ao Free.
        return {
          push: push('Seu teste acaba hoje', 'Mandamos por e-mail como continuar no PRO.'),
          email: emailEx03({
            subject: 'Seu teste do PRO acaba hoje',
            title: 'Seu teste acaba hoje',
            text: `Para continuar no PRO, pague a primeira cobrança de ${preco} (plano ${plano}) hoje, com Pix, boleto ou cartão, na página de pagamento.`,
            cta: 'Abrir pagamento',
            href: planoUrl,
            note: 'Sem pagamento, você volta ao Free e não perde nada.',
          }),
        };
      }
      return {
        push: push('Seu PRO vence hoje', 'Depois, 7 dias de carência. Nada muda até lá.'),
        email: emailEx03({
          subject: 'Falta confirmar o pagamento do PRO',
          title: 'Falta confirmar o pagamento',
          text: `O pagamento de ${preco} vence hoje. Assim que cair, o PRO segue sozinho. Se não der hoje, você tem 7 dias de carência.`,
          cta: 'Abrir pagamento',
          href: planoUrl,
          note: 'Pix cai na hora · boleto em até 2 dias úteis · cartão já salvo é cobrado sozinho.',
        }),
      };
    case 'GRACE_5_LEFT':
    case 'GRACE_2_LEFT': {
      const faltam = kind === 'GRACE_5_LEFT' ? 5 : 2;
      return {
        push: push(
          `Faltam ${faltam} dias para a IA pausar`,
          'Seu registro e seu histórico continuam.',
        ),
        email: emailEx03({
          subject: `Faltam ${faltam} dias para a IA do Fatia pausar`,
          title: 'Não conseguimos confirmar o pagamento',
          text: `Você segue com PRO até ${carencia}. Depois volta ao Free, sem perder nada.`,
          cta: 'Atualizar pagamento',
          href: planoUrl,
          note: NOTA_DA_LOJA,
        }),
      };
    }
    case 'AI_PAUSED':
      return {
        push: push('A IA pausou', 'O registro continua normal.'),
        email: emailEx03({
          subject: 'Seu PRO acabou',
          title: 'Seu PRO acabou',
          text: 'Tudo o que você registrou continua lá. Chat, foto e ditado voltam quando você quiser.',
          cta: 'Voltar ao PRO',
          href: planoUrl,
          note: 'Registro manual e sua própria IA pelo MCP seguem grátis.',
        }),
      };
    case 'STORE_BILLING_ISSUE': {
      const l = loja ?? LOJA.APPLE;
      return {
        push: push('A loja não conseguiu cobrar', 'Atualize o pagamento nas assinaturas da loja.'),
        email: emailEx03({
          subject: 'A loja não conseguiu cobrar seu PRO',
          title: 'A loja não conseguiu cobrar',
          text: `Atualize o pagamento na ${l.nome}. Enquanto isso, seu PRO segue até ${carencia}.`,
          cta: `Abrir assinaturas da ${l.nome}`,
          href: l.url,
          note: 'Quem assina pela loja paga pela loja. O Fatia não vê nem guarda seu cartão.',
        }),
      };
    }
  }
}
