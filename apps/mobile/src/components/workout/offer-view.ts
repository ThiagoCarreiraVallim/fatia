import {
  dayMonth,
  diffSummary,
  offerTitle,
  receivedOfferBanner,
  type PlanOffer,
  type PlanOfferSummary,
} from '@fatia/api-client';

/**
 * Contas da tela do plano recebido no app (#379, pranchas Al-T2 e Al-T2b) que
 * não dependem de tela: em que pé a resposta está, os botões de baixo e o
 * texto das confirmações. O texto do plano em si mora no api-client.
 */

export type OfferStage = 'answer' | 'accepted' | 'declined' | 'superseded';

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? null;

export function offerStage(offer: Pick<PlanOffer, 'shown'>): OfferStage {
  switch (offer.shown.status) {
    case 'ACCEPTED':
      return 'accepted';
    case 'DECLINED':
      return 'declined';
    case 'SUPERSEDED':
      return 'superseded';
    default:
      return 'answer';
  }
}

/** Os dois botões presos embaixo (prancha: "Recusar" + "Aceitar plano"). */
export function offerActions(offer: Pick<PlanOffer, 'shown' | 'kind' | 'planId'>): {
  primary: string;
  secondary: string | null;
} {
  const stage = offerStage(offer);
  if (stage === 'answer') {
    return offer.kind === 'update'
      ? { primary: 'Aceitar troca', secondary: 'Manter atual' }
      : { primary: 'Aceitar plano', secondary: 'Recusar' };
  }
  if (stage === 'accepted' && offer.planId) {
    return { primary: 'Começar agora', secondary: 'Voltar' };
  }
  return { primary: 'Voltar', secondary: null };
}

export interface ConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

/** O aceite pergunta antes: o plano entra na conta e, no calendário, na agenda. */
export function acceptConfirm(offer: Pick<PlanOffer, 'shown' | 'kind' | 'diff'>): ConfirmCopy {
  const v = offer.shown;
  if (offer.kind === 'update') {
    const what = offer.diff ? `${diffSummary(offer.diff)}. ` : '';
    return {
      title: `Trocar pela v${v.version}?`,
      description: `${what}O plano em uso muda; o histórico dos treinos continua.`,
      confirmLabel: 'Aceitar troca',
    };
  }
  const description =
    v.schedule === 'CALENDAR' && v.startDate && v.endDate
      ? `Ele entra nos seus planos e as sessões vão para a sua agenda, de ${dayMonth(v.startDate)} a ${dayMonth(v.endDate)}.`
      : 'Ele entra nos seus planos. Sem datas: você treina no seu ritmo.';
  return { title: `Aceitar ${offerTitle(v)}?`, description, confirmLabel: 'Aceitar plano' };
}

/** Recusar também pergunta; recusar uma atualização é manter a versão em uso. */
export function declineConfirm(offer: Pick<PlanOffer, 'shown' | 'kind' | 'author'>): ConfirmCopy {
  const who = firstName(offer.author?.name);
  const told = who ? `Avisamos ${who}.` : 'Avisamos a equipe.';
  if (offer.kind === 'update') {
    return {
      title: 'Manter a versão atual?',
      description: `Seu plano não muda. ${told}`,
      confirmLabel: 'Manter atual',
    };
  }
  return {
    title: `Recusar ${offerTitle(offer.shown)}?`,
    description: `${told} Dá para desfazer depois.`,
    confirmLabel: 'Recusar',
  };
}

/** O aviso no topo do Treino: a oferta mais recente, e quantas mais esperam. */
export function pendingOfferBanner(pending: PlanOfferSummary[]): {
  title: string;
  sub: string;
  href: string;
  authorName: string | null;
} | null {
  const first = pending[0];
  if (!first) return null;
  const copy = receivedOfferBanner(first);
  const more = pending.length - 1;
  return {
    title: copy.title,
    sub: more > 0 ? `${copy.sub} · mais ${more} esperando` : copy.sub,
    href: first.href,
    authorName: first.authorName,
  };
}

/** O fuso do aparelho, para "hoje 09:12" no remetente. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}
