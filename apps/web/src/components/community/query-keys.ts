/** Chaves de cache das telas de comunidade. Tudo sob `['community']`: entrar ou sair invalida o prefixo. */
export const communityKeys = {
  mine: ['community', 'mine'] as const,
  group: (groupId: string) => ['community', 'group', groupId] as const,
  members: (groupId: string) => ['community', 'members', groupId] as const,
  accessLog: (groupId: string) => ['community', 'access-log', groupId] as const,
};
