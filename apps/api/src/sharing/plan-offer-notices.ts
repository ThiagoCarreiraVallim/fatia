import { NotificationKind } from '@fatia/db';
import type { Notice } from '../notifications/notification.service';
import { firstName } from './display-name';

/**
 * Os avisos do plano recebido (#379). Aparecem na tela bloqueada: levam o
 * primeiro nome de quem agiu e o nome do plano, nunca o conteúdo dele.
 */

export function offerSentNotice(p: { offerId: string; authorName: string; title: string }): Notice {
  return {
    kind: NotificationKind.PLAN_RECEIVED,
    title: `${firstName(p.authorName)} enviou um plano de treino`,
    body: `${p.title}. Toque para ver e aceitar.`,
    url: `/workout/offers/${p.offerId}`,
  };
}

export function offerUpdatedNotice(p: {
  offerId: string;
  authorName: string;
  title: string;
}): Notice {
  return {
    kind: NotificationKind.PLAN_RECEIVED,
    title: `${firstName(p.authorName)} atualizou seu plano`,
    body: `${p.title}. Veja o que mudou e decida se troca.`,
    url: `/workout/offers/${p.offerId}`,
  };
}

/** Para a equipe: a resposta do aluno. Leva ao painel da comunidade. */
export function offerAnsweredNotice(p: {
  groupId: string;
  studentName: string;
  title: string;
  answer: 'accepted' | 'declined' | 'kept';
}): Notice {
  const verbo = {
    accepted: 'aceitou',
    declined: 'recusou',
    kept: 'manteve a versão atual de',
  }[p.answer];
  return {
    kind: NotificationKind.COMMUNITY,
    title: 'Resposta ao plano de treino',
    body: `${firstName(p.studentName)} ${verbo} ${p.title}.`,
    url: `/org/${p.groupId}/members`,
  };
}

/** Para a pessoa (#402): a equipe terminou ou tirou um plano dela. */
export function offerRemovedNotice(p: {
  authorName: string;
  title: string;
  ended: boolean;
}): Notice {
  return {
    kind: NotificationKind.PLAN_RECEIVED,
    title: p.ended
      ? `${firstName(p.authorName)} terminou um plano seu`
      : `${firstName(p.authorName)} tirou um plano seu`,
    body: p.ended
      ? `${p.title} termina hoje. O que você registrou continua no seu histórico.`
      : `${p.title} saiu da sua lista. O que você registrou continua no seu histórico.`,
    url: '/workout/plans',
  };
}

/** Plano alimentar enviado pela biblioteca (#405): leva à tela do plano alimentar. */
export function nutritionPlanSentNotice(p: { authorName: string; update: boolean }): Notice {
  return {
    kind: NotificationKind.PLAN_RECEIVED,
    title: p.update
      ? `${firstName(p.authorName)} atualizou seu plano alimentar`
      : `${firstName(p.authorName)} enviou um plano alimentar`,
    body: p.update ? 'Veja o que mudou e decida se troca.' : 'Toque para ver e aceitar.',
    url: '/nutrition/plan',
  };
}
