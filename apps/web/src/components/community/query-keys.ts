/** Chaves de cache das telas de comunidade. Tudo sob `['community']`: entrar ou sair invalida o prefixo. */
export const communityKeys = {
  mine: ['community', 'mine'] as const,
  group: (groupId: string) => ['community', 'group', groupId] as const,
  members: (groupId: string) => ['community', 'members', groupId] as const,
  accessLog: (groupId: string) => ['community', 'access-log', groupId] as const,
  plans: (groupId: string) => ['community', 'plans', groupId] as const,
  plan: (groupId: string, id: string) => ['community', 'plans', groupId, id] as const,
  tips: (groupId: string) => ['community', 'tips', groupId] as const,
  exercises: (groupId: string) => ['community', 'exercises', groupId] as const,
  /** Desafios: a mesma lista serve ao membro e ao painel. */
  challenges: (groupId: string) => ['community', 'challenges', groupId] as const,
  challenge: (groupId: string, id: string) => ['community', 'challenges', groupId, id] as const,
  /** O mural: a lista paginada, e cada post aberto com os comentários. */
  feed: (groupId: string) => ['community', 'feed', groupId] as const,
  post: (groupId: string, id: string) => ['community', 'feed', groupId, id] as const,
};
/** Chaves do painel da equipe. Sob `['community', 'org', groupId]`: uma mudança invalida o painel inteiro. */
export const orgKeys = {
  all: (groupId: string) => ['community', 'org', groupId] as const,
  group: (groupId: string) => ['community', 'group', groupId] as const,
  members: (groupId: string) => ['community', 'org', groupId, 'members'] as const,
  invites: (groupId: string) => ['community', 'org', groupId, 'invites'] as const,
  seats: (groupId: string) => ['community', 'org', groupId, 'seats'] as const,
  invoices: (groupId: string) => ['community', 'org', groupId, 'invoices'] as const,
  contentPlans: (groupId: string) => ['community', 'org', groupId, 'content', 'plans'] as const,
  contentPlan: (groupId: string, id: string) =>
    ['community', 'org', groupId, 'content', 'plans', id] as const,
  contentTips: (groupId: string) => ['community', 'org', groupId, 'content', 'tips'] as const,
  exercises: (groupId: string) => ['community', 'org', groupId, 'exercises'] as const,
  exercise: (groupId: string, id: number) =>
    ['community', 'org', groupId, 'exercises', id] as const,
  agent: (groupId: string) => ['community', 'org', groupId, 'agent'] as const,
  moderation: (groupId: string) => ['community', 'org', groupId, 'moderation'] as const,
  reports: (groupId: string) => ['community', 'org', groupId, 'moderation', 'reports'] as const,
  removedPosts: (groupId: string) =>
    ['community', 'org', groupId, 'moderation', 'removed'] as const,
  bans: (groupId: string) => ['community', 'org', groupId, 'moderation', 'bans'] as const,
  insightsPanels: (groupId: string) => ['community', 'org', groupId, 'insights'] as const,
  insightsCuts: (groupId: string, panel: string) =>
    ['community', 'org', groupId, 'insights', panel] as const,
  insights: (groupId: string, panel: string, cut: string, period: string) =>
    ['community', 'org', groupId, 'insights', panel, cut, period] as const,
};
