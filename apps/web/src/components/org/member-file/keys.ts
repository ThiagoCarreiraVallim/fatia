/** Chaves da ficha (#402). Tudo sob o grupo, para sair junto ao trocar de comunidade. */
export const fileKeys = {
  file: (groupId: string, membershipId: string) =>
    ['community', 'org', groupId, 'member-file', membershipId] as const,
  agenda: (groupId: string, membershipId: string, from: string, to: string) =>
    ['community', 'org', groupId, 'member-file', membershipId, 'agenda', from, to] as const,
  library: (groupId: string) => ['community', 'org', groupId, 'content', 'plans'] as const,
};
