import { NotificationKind } from '@fatia/db';
import type { Notice } from '../notifications/notification.service';

/**
 * Os textos dos avisos da comunidade (Fase 8c, ADR 033). Aparecem na tela
 * bloqueada, então levam só o nome da comunidade, o apelido ou o nome de quem
 * agiu e o título do desafio — nunca dado de saúde, posição em ranking nem o
 * texto do post ou do comentário.
 */

export function inviteNotice(p: { groupName: string; inviterName: string; token: string }): Notice {
  return {
    kind: NotificationKind.COMMUNITY,
    title: `Convite para ${p.groupName}`,
    body: `${p.inviterName} convidou você. Toque para ver o convite.`,
    url: `/c/${p.token}`,
  };
}

/**
 * A pessoa convidada recusou (#372, Onb-E1: "O Bruno vai ver que você recusou").
 * Vai para quem convidou e para o dono. Equipe abre a Equipe; membro, a
 * Ativação pendente, onde o convite aparece como "recusou".
 */
export function inviteDeclinedNotice(p: {
  groupId: string;
  groupName: string;
  personName: string;
  team: boolean;
}): Notice {
  return {
    kind: NotificationKind.COMMUNITY,
    title: `Convite recusado em ${p.groupName}`,
    body: p.team
      ? `${p.personName} recusou o convite para a equipe.`
      : `${p.personName} recusou o convite.`,
    url: `/org/${p.groupId}/${p.team ? 'team' : 'activation'}`,
  };
}

export function joinRequestNotice(p: {
  groupId: string;
  groupName: string;
  requesterName: string;
}): Notice {
  return {
    kind: NotificationKind.COMMUNITY,
    title: `Pedido para entrar em ${p.groupName}`,
    body: `${p.requesterName} quer entrar. Aprove ou recuse no painel.`,
    url: `/org/${p.groupId}/members`,
  };
}

export function joinApprovedNotice(p: { groupId: string; groupName: string }): Notice {
  return {
    kind: NotificationKind.COMMUNITY,
    title: `Você entrou em ${p.groupName}`,
    body: 'Seu pedido foi aprovado.',
    url: `/community/${p.groupId}`,
  };
}

export function challengeCreatedNotice(p: {
  groupId: string;
  groupName: string;
  challengeId: string;
  title: string;
}): Notice {
  return {
    kind: NotificationKind.CHALLENGES,
    title: `Desafio novo em ${p.groupName}`,
    body: `${p.title}. Entre para participar.`,
    url: `/community/${p.groupId}/challenges/${p.challengeId}`,
  };
}

export function challengeEndedNotice(p: {
  groupId: string;
  groupName: string;
  challengeId: string;
  title: string;
}): Notice {
  return {
    kind: NotificationKind.CHALLENGES,
    title: `${p.title} terminou`,
    body: `Veja como ficou o ranking em ${p.groupName}.`,
    url: `/community/${p.groupId}/challenges/${p.challengeId}`,
  };
}

/** O desafio começou: para quem pediu "Me avise" e para quem já entrou (#395). */
export function challengeStartedNotice(p: {
  groupId: string;
  groupName: string;
  challengeId: string;
  title: string;
}): Notice {
  return {
    kind: NotificationKind.CHALLENGES,
    title: `${p.title} começou`,
    body: `O desafio de ${p.groupName} está valendo a partir de hoje.`,
    url: `/community/${p.groupId}/challenges/${p.challengeId}`,
  };
}

/** A equipe anulou um check-in ou um dia: o motivo vai para a pessoa (#395, ADR 044). */
export function checkinVoidedNotice(p: {
  groupId: string;
  challengeId: string;
  title: string;
  reason: string;
}): Notice {
  return {
    kind: NotificationKind.CHALLENGES,
    title: `Check-in anulado em ${p.title}`,
    body: `Motivo da equipe: ${p.reason}`,
    url: `/community/${p.groupId}/challenges/${p.challengeId}`,
  };
}

export function commentNotice(p: { groupId: string; groupName: string; author: string }): Notice {
  return {
    kind: NotificationKind.FEED,
    title: `${p.author} comentou seu post`,
    body: `No mural de ${p.groupName}.`,
    url: `/community/${p.groupId}/feed`,
  };
}

/** O primeiro de uma janela; os seguintes saem juntos ("Helena e mais 3 reagiram"). */
export function reactionNotice(p: { groupId: string; groupName: string; author: string }): Notice {
  return {
    kind: NotificationKind.FEED,
    title: `${p.author} reagiu ao seu post`,
    body: `No mural de ${p.groupName}.`,
    url: `/community/${p.groupId}/feed`,
  };
}

export function removedNotice(p: {
  groupId: string;
  groupName: string;
  what: 'post' | 'comment';
}): Notice {
  return {
    kind: NotificationKind.MODERATION,
    title: p.what === 'post' ? 'A equipe removeu seu post' : 'A equipe removeu seu comentário',
    body:
      p.what === 'post'
        ? `No mural de ${p.groupName}. Só você vê o post, com o motivo.`
        : `No mural de ${p.groupName}.`,
    url: `/community/${p.groupId}/feed`,
  };
}

/**
 * Para quem denunciou (prancha Ex-06): a equipe revisou. Nem a decisão nem o
 * que foi denunciado aparecem na tela bloqueada.
 */
export function reportReviewedNotice(p: { groupId: string; groupName: string }): Notice {
  return {
    kind: NotificationKind.MODERATION,
    title: 'Sua denúncia foi revisada pela equipe',
    body: `No mural de ${p.groupName}.`,
    url: `/community/${p.groupId}`,
  };
}
