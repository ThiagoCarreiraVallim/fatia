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

export function commentNotice(p: { groupId: string; groupName: string; author: string }): Notice {
  return {
    kind: NotificationKind.FEED,
    title: `${p.author} comentou seu post`,
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
