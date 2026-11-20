import type { SeatInvoiceKind } from '@prisma/client';
import type { EmailMessage } from '../notifications/email.service';
import { FUSO_DO_PROVEDOR } from './seat-pricing';

/** O que o e-mail Ex-04 lê de uma fatura vencida dos assentos (#403). */
export interface OverdueSeatInvoice {
  groupName: string;
  kind: SeatInvoiceKind;
  /** Assentos cobrados; nulo em fatura antiga. */
  seats: number | null;
  unitPriceCents: number;
  amountCents: number;
  /** Vencimento `YYYY-MM-DD`. */
  dueDate: string | null;
  /** Dias que faltam da carência (pelo `graceEndsAt` do pool). */
  graceDaysLeft: number | null;
  /** Página da fatura no Asaas; sem ela, o botão leva ao painel. */
  payUrl: string | null;
  panelUrl: string;
}

function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/\u00a0/g, ' ');
}

const meioDia = (ymd: string) => new Date(`${ymd}T15:00:00Z`);

function diaCurto(ymd: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: FUSO_DO_PROVEDOR,
  })
    .format(meioDia(ymd))
    .replace(' de ', ' ')
    .replace('.', '');
}

function mes(ymd: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: FUSO_DO_PROVEDOR }).format(
    meioDia(ymd),
  );
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * E-mail da prancha Ex-04: a fatura dos assentos venceu. Vai só ao dono (quem
 * paga); o membro nunca sabe da fatura da academia. Preço e total saem da
 * fatura real — a prancha tinha "R$ 9,90" fixo, e o preço é o da configuração
 * gravado no pool. A carência é a do `graceEndsAt`, e o texto diz o que
 * acontece: só a IA pausa, nada é apagado.
 */
export function seatInvoiceOverdueEmail(f: OverdueSeatInvoice): Omit<EmailMessage, 'to'> {
  const doQue =
    f.kind === 'ADJUSTMENT'
      ? 'ajuste de assentos'
      : f.kind === 'PROGRAM'
        ? 'programa'
        : f.dueDate
          ? `assentos de ${mes(f.dueDate)}`
          : 'assentos';
  const total = brl(f.amountCents);
  // "120 assentos × R$ 14,90" só quando a conta fecha com o total.
  const conta =
    f.seats && f.seats * f.unitPriceCents === f.amountCents
      ? `${f.seats === 1 ? '1 assento' : `${f.seats} assentos`} × ${brl(f.unitPriceCents)}`
      : 'Valor';
  const vence = f.dueDate ? diaCurto(f.dueDate) : null;
  const dias = f.graceDaysLeft ?? 0;
  const nota =
    dias > 0
      ? `Os membros seguem com PRO por mais ${dias === 1 ? '1 dia' : `${dias} dias`}. Depois, só a IA pausa até o pagamento: nada é apagado, e o que eles registraram continua com eles.`
      : 'A IA dos membros está pausada até o pagamento. Nada é apagado, e o que eles registraram continua com eles.';
  const href = f.payUrl ?? f.panelUrl;
  const titulo = `${f.groupName} · ${doQue}`;

  const text = [
    'FATURA VENCIDA',
    titulo,
    '',
    `${conta}: ${total}`,
    ...(vence ? [`Vencimento: ${vence}`] : []),
    '',
    `Pagar fatura: ${href}`,
    '',
    nota,
  ].join('\n');

  const linha = (a: string, b: string, borda: boolean) =>
    `<tr><td style="padding:8px 0;color:#666666${borda ? ';border-top:1px solid #eeeeee' : ''}">${escapeHtml(a)}</td><td style="text-align:right;padding:8px 0${borda ? ';border-top:1px solid #eeeeee' : ''}">${escapeHtml(b)}</td></tr>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#e9e9e6;font-family:Manrope,Arial,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px">
<tr><td style="padding:24px 32px;border-bottom:1px solid #eeeeee;font-size:17px;font-weight:800">Fatia</td></tr>
<tr><td style="padding:32px 32px 0;font-size:12px;font-weight:800;letter-spacing:.06em;color:#b45309">FATURA VENCIDA</td></tr>
<tr><td style="padding:14px 32px 0;font-size:26px;line-height:1.15;font-weight:700">${escapeHtml(titulo)}</td></tr>
<tr><td style="padding:14px 32px 0"><table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">${linha(conta, total, false)}${vence ? linha('Vencimento', vence, true) : ''}</table></td></tr>
<tr><td style="padding:18px 32px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;border-radius:12px;font-weight:800;text-decoration:none;background:#1b1b1b;color:#ffffff">Pagar fatura</a></td></tr>
<tr><td style="padding:14px 32px 32px;font-size:13px;color:#777777">${escapeHtml(nota)}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #eeeeee;font-size:12px;color:#777777">Fatia · fat.ia.br · Você recebe este e-mail porque é dono de uma comunidade no Fatia.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `Fatura vencida: ${doQue} da ${f.groupName}`, text, html };
}
