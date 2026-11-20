import { apiFetch } from './http';
import { formatBRL } from './plan';

/**
 * Ofertas (#403, Pn-37 e Pn-37b): programas vendidos pela comunidade, pagos
 * pelo Asaas. Só o dono, só na web: o app nunca vende fora da loja. A venda
 * em si liga com `salesEnabled` (checkout público, #421). Tudo aqui é
 * apresentação.
 */

export type OfferStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface OfferView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceCents: number;
  spots: number | null;
  /** `YYYY-MM-DD`. */
  startDate: string | null;
  endDate: string | null;
  /** Quem compra entra na comunidade. */
  grantsEntry: boolean;
  program: { id: string; name: string } | null;
  planTemplate: { id: string; title: string } | null;
  extras: string | null;
  status: OfferStatus;
  publishedAt: string | null;
  closedAt: string | null;
  saleUrl: string;
  stats: {
    sales: number;
    spotsLeft: number | null;
    revenueCents: number;
    netCents: number;
  };
  failed: { purchaseId: string; name: string; since: string | null; canResend: boolean }[];
}

export interface OffersList {
  salesEnabled: boolean;
  platformFeePercent: number;
  offers: OfferView[];
}

export interface OfferInput {
  title?: string;
  description?: string | null;
  priceCents?: number;
  spots?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  grantsEntry?: boolean;
  programId?: string | null;
  planTemplateId?: string | null;
  extras?: string | null;
}

const base = (groupId: string) => `/api/groups/${groupId}/offers`;
const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const offersApi = {
  list: (groupId: string) => apiFetch<OffersList>(base(groupId)),
  create: (groupId: string, input: OfferInput & { title: string; priceCents: number }) =>
    apiFetch<OfferView>(base(groupId), post(input)),
  update: (groupId: string, offerId: string, input: OfferInput) =>
    apiFetch<OfferView>(`${base(groupId)}/${offerId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  publish: (groupId: string, offerId: string) =>
    apiFetch<OfferView>(`${base(groupId)}/${offerId}/publish`, post()),
  close: (groupId: string, offerId: string) =>
    apiFetch<OfferView>(`${base(groupId)}/${offerId}/close`, post()),
  duplicate: (groupId: string, offerId: string) =>
    apiFetch<OfferView>(`${base(groupId)}/${offerId}/duplicate`, post()),
  /** "Reenviar link de pagamento" a quem o pagamento falhou. */
  resendLink: (groupId: string, offerId: string, purchaseId: string) =>
    apiFetch<{ sent: boolean }>(
      `${base(groupId)}/${offerId}/purchases/${purchaseId}/resend`,
      post(),
    ),
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const partes = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];
const dia = (ymd: string) => {
  const [, m, d] = partes(ymd);
  return `${d} ${MESES[m - 1]}`;
};

/** "R$ 149" sem centavos quando redondo; "R$ 149,90" quando não. */
export function offerPriceLabel(cents: number): string {
  const v = formatBRL(cents);
  return cents % 100 === 0 ? v.replace(/,00$/, '') : v;
}

function periodo(o: Pick<OfferView, 'startDate' | 'endDate'>): string | null {
  if (!o.startDate) return null;
  if (!o.endDate) return `a partir de ${dia(o.startDate)}`;
  const [ya, ma, da] = partes(o.startDate);
  const [yb, mb] = partes(o.endDate);
  return ya === yb && ma === mb
    ? `${da} a ${dia(o.endDate)}`
    : `${dia(o.startDate)} a ${dia(o.endDate)}`;
}

/** "1 a 21 dez · até 30 vagas". */
export function offerMeta(o: Pick<OfferView, 'startDate' | 'endDate' | 'spots'>): string {
  return [periodo(o), o.spots ? `até ${o.spots} vagas` : 'sem limite de vagas']
    .filter(Boolean)
    .join(' · ');
}

const STATUS: Record<OfferStatus, string> = {
  DRAFT: 'rascunho',
  ACTIVE: 'ativa',
  CLOSED: 'encerrada',
};

/** "ativa", ou "ativa · 2 pagamentos falharam" (Pn-37b). */
export function offerStatusLabel(o: Pick<OfferView, 'status' | 'failed'>): string {
  const n = o.failed.length;
  if (o.status !== 'ACTIVE' || n === 0) return STATUS[o.status];
  return `${STATUS.ACTIVE} · ${n === 1 ? '1 pagamento falhou' : `${n} pagamentos falharam`}`;
}

/** "fat.ia.br/academia-demo/verao-21": o link sem o protocolo. */
export function saleUrlLabel(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/** "O que a pessoa recebe", montado do que a oferta liga. */
export function offerReceives(
  o: Pick<OfferView, 'planTemplate' | 'extras' | 'program' | 'grantsEntry'>,
): string {
  const itens = [
    o.planTemplate ? `Plano ${o.planTemplate.title}` : null,
    o.extras,
    o.program ? `assento PRO do programa ${o.program.name}` : null,
    o.grantsEntry ? 'entra na comunidade' : null,
  ].filter(Boolean);
  if (itens.length === 0) return 'Ainda não diz o que a pessoa recebe.';
  return `${itens.join(' · ')}. No fim, nada do que registrou se perde.`;
}

/** A linha debaixo da receita: o líquido depois da taxa da plataforma. */
export function offerRevenueSub(o: Pick<OfferView, 'stats'>, feePercent: number): string {
  if (feePercent <= 0) return 'sem taxa da plataforma';
  return `${formatBRL(o.stats.netCents)} depois da taxa de ${feePercent}%`;
}

/** "Duplicar para janeiro": o rascunho novo vai um mês depois. */
export function duplicateOfferLabel(o: Pick<OfferView, 'startDate'>): string {
  if (!o.startDate) return 'Duplicar';
  const m = partes(o.startDate)[1];
  return `Duplicar para ${MESES_LONGOS[m % 12]}`;
}

export function filterOffers(list: readonly OfferView[], status: OfferStatus): OfferView[] {
  return list.filter((o) => o.status === status);
}
