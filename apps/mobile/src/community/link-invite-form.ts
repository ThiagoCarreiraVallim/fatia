import type { CreateInviteInput, GrantableRole } from '@fatia/api-client';

/**
 * O formulário do link de convite no app (#401). Convite de equipe dá
 * permissão de equipe: sempre com prazo (30 dias) e com limite de usos (1 por
 * padrão), como no painel web — a API recusa "sem limite" e "sem prazo".
 */
export function linkInviteForm(role: GrantableRole): {
  defaultUses: string;
  usesPlaceholder: string;
  validity: string;
} {
  if (role === 'MEMBER') {
    return {
      defaultUses: '',
      usesPlaceholder: 'Limite de usos (vazio = sem limite)',
      validity: 'Vale por 7 dias.',
    };
  }
  return {
    defaultUses: '1',
    usesPlaceholder: 'Limite de usos',
    validity: 'Convite de equipe vale 30 dias e tem limite de usos.',
  };
}

export function linkInviteInput(role: GrantableRole, usos: string): CreateInviteInput {
  const n = Number(usos);
  if (role === 'MEMBER') {
    return { role, ...(n > 0 ? { maxUses: n } : {}), expiresInDays: 7 };
  }
  return { role, maxUses: n > 0 ? n : 1, expiresInDays: 30 };
}
