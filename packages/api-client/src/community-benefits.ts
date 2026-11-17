import { apiFetch } from './http';

/**
 * Benefícios de parceiros da comunidade (#393): a vitrine do membro (Cm-22) e
 * o cadastro do dono no painel (Pn-28). O Fatia só guarda o texto, o cupom e
 * o link; não rastreia a compra nem passa dado ao parceiro.
 */

export type BenefitKind = 'COUPON' | 'LINK';

/** O que o membro vê. Vencido (ontem) vem sem cupom nem link e sai amanhã. */
export interface MemberBenefit {
  id: string;
  partnerName: string;
  logoUrl: string | null;
  discountText: string;
  kind: BenefitKind;
  couponCode: string | null;
  url: string | null;
  /** `YYYY-MM-DD`, último dia em que vale, no fuso da comunidade. */
  validUntil: string;
  expired: boolean;
}

/** O que o painel vê. */
export interface TeamBenefit extends Omit<MemberBenefit, 'expired'> {
  logoFileId: string | null;
  status: 'active' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface BenefitInput {
  partnerName: string;
  discountText: string;
  kind: BenefitKind;
  couponCode: string | null;
  url: string | null;
  validUntil: string;
  logoFileId: string | null;
}

const base = (groupId: string) => `/api/groups/${groupId}/benefits`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const benefitsApi = {
  list: (groupId: string) => apiFetch<MemberBenefit[]>(base(groupId)),
  manage: (groupId: string) => apiFetch<TeamBenefit[]>(`${base(groupId)}/manage`),
  create: (groupId: string, input: BenefitInput) =>
    apiFetch<TeamBenefit>(base(groupId), json('POST', input)),
  update: (groupId: string, id: string, input: Partial<BenefitInput>) =>
    apiFetch<TeamBenefit>(`${base(groupId)}/${id}`, json('PATCH', input)),
  remove: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${base(groupId)}/${id}`, json('DELETE')),
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "31 dez". */
function benefitDay(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** O selo da validade: "até 31 dez", ou "venceu". */
export function benefitValidity(b: Pick<MemberBenefit, 'validUntil' | 'expired'>): string {
  return b.expired ? 'venceu' : `até ${benefitDay(b.validUntil)}`;
}

/** "Venceu em 31 out. Sai da lista amanhã." */
export function benefitExpiredNote(b: Pick<MemberBenefit, 'validUntil'>): string {
  return `Venceu em ${benefitDay(b.validUntil)}. Sai da lista amanhã.`;
}

/** As iniciais no lugar do logo: duas letras. */
export function benefitInitials(name: string): string {
  const palavras = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (palavras.length >= 2) return (palavras[0][0] + palavras[1][0]).toUpperCase();
  return (palavras[0] ?? '?').slice(0, 2).toUpperCase();
}

export const BENEFITS_PRIVACY_NOTE =
  'Abre fora do app. O Fatia não recebe dado da compra e não passa seus dados ao parceiro.';

export const benefitCopiedToast = (code: string) => `Código ${code} copiado`;

// ---------------------------------------------------------------- painel

export interface BenefitDraft {
  partnerName: string;
  discountText: string;
  kind: BenefitKind;
  couponCode: string;
  url: string;
  validUntil: string;
  logoFileId: string | null;
}

export function emptyBenefitDraft(today: string): BenefitDraft {
  return {
    partnerName: '',
    discountText: '',
    kind: 'COUPON',
    couponCode: '',
    url: '',
    validUntil: today,
    logoFileId: null,
  };
}

export function benefitToDraft(b: TeamBenefit): BenefitDraft {
  return {
    partnerName: b.partnerName,
    discountText: b.discountText,
    kind: b.kind,
    couponCode: b.couponCode ?? '',
    url: b.url ?? '',
    validUntil: b.validUntil,
    logoFileId: b.logoFileId,
  };
}

export type BenefitDraftErrors = Partial<Record<keyof BenefitDraft, string>>;

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Confere o formulário com as mesmas regras da API e devolve o corpo pronto. */
export function benefitDraftToInput(
  d: BenefitDraft,
  today: string,
): { ok: true; input: BenefitInput } | { ok: false; errors: BenefitDraftErrors } {
  const errors: BenefitDraftErrors = {};
  const partnerName = d.partnerName.trim();
  const discountText = d.discountText.trim();
  const couponCode = d.couponCode.trim().toUpperCase();
  const url = d.url.trim();
  if (!partnerName) errors.partnerName = 'Diga o parceiro';
  if (!discountText) errors.discountText = 'Diga o desconto';
  if (d.kind === 'COUPON' && !/^[A-Z0-9_-]{2,40}$/.test(couponCode)) {
    errors.couponCode = couponCode ? 'Use letras, números, - e _' : 'Digite o código do cupom';
  }
  if (d.kind === 'LINK' && !isHttps(url)) errors.url = 'O link precisa começar com https://';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.validUntil)) errors.validUntil = 'Escolha a validade';
  else if (d.validUntil < today) errors.validUntil = 'A validade não pode estar no passado';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      partnerName,
      discountText,
      kind: d.kind,
      couponCode: d.kind === 'COUPON' ? couponCode : null,
      url: d.kind === 'LINK' ? url : null,
      validUntil: d.validUntil,
      logoFileId: d.logoFileId,
    },
  };
}
