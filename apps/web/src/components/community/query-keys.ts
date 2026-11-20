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
  /** A lista do mural com um filtro (Tudo, Equipe, Conteúdo novo, Membros). */
  feedList: (groupId: string, filter: string) =>
    ['community', 'feed', groupId, 'list', filter] as const,
  /** A aba Para você e o número dela. */
  forYou: (groupId: string) => ['community', 'for-you', groupId] as const,
  /** Quem da equipe vê o quê de mim (Sobre). */
  team: (groupId: string) => ['community', 'team', groupId] as const,
  myNotes: (groupId: string) => ['community', 'my-notes', groupId] as const,
  benefits: (groupId: string) => ['community', 'benefits', groupId] as const,
};
/** Chaves do painel da equipe. Sob `['community', 'org', groupId]`: uma mudança invalida o painel inteiro. */
export const orgKeys = {
  all: (groupId: string) => ['community', 'org', groupId] as const,
  group: (groupId: string) => ['community', 'group', groupId] as const,
  members: (groupId: string) => ['community', 'org', groupId, 'members'] as const,
  /** Membros com quem saiu (aba "Saíram", #401): chave própria, sob `members`. */
  membersWithLeft: (groupId: string) =>
    ['community', 'org', groupId, 'members', 'with-left'] as const,
  invites: (groupId: string) => ['community', 'org', groupId, 'invites'] as const,
  invitesOverview: (groupId: string) =>
    ['community', 'org', groupId, 'invites', 'overview'] as const,
  pendingInvites: (groupId: string, origin: string | undefined, q: string, page: number) =>
    ['community', 'org', groupId, 'invites', 'pending', origin ?? 'all', q, page] as const,
  seats: (groupId: string) => ['community', 'org', groupId, 'seats'] as const,
  /** A tela Equipe e permissões (#404). */
  staff: (groupId: string) => ['community', 'org', groupId, 'staff'] as const,
  permissions: (groupId: string) => ['community', 'org', groupId, 'permissions'] as const,
  invoices: (groupId: string) => ['community', 'org', groupId, 'invoices'] as const,
  /** Programas por aluno (#403, Pn-30). */
  planPrograms: (groupId: string) => ['community', 'org', groupId, 'plan-programs'] as const,
  /** Ofertas da comunidade (#403, Pn-37). */
  offers: (groupId: string) => ['community', 'org', groupId, 'offers'] as const,
  /** Programas de assentos (#403), para ligar a uma oferta. */
  seatPrograms: (groupId: string) => ['community', 'org', groupId, 'seat-programs'] as const,
  /** Os desafios, para o programa de desafio (#403). */
  challengesList: (groupId: string) => ['community', 'org', groupId, 'challenges', 'list'] as const,
  contentPlans: (groupId: string) => ['community', 'org', groupId, 'content', 'plans'] as const,
  /** Enviar para alunos (#405): quem pode receber e o que já foi enviado. */
  sendRecipients: (groupId: string, templateId: string) =>
    ['community', 'org', groupId, 'sends', 'recipients', templateId] as const,
  sends: (groupId: string) => ['community', 'org', groupId, 'sends', 'list'] as const,
  contentPlan: (groupId: string, id: string) =>
    ['community', 'org', groupId, 'content', 'plans', id] as const,
  contentTips: (groupId: string) => ['community', 'org', groupId, 'content', 'tips'] as const,
  exercises: (groupId: string) => ['community', 'org', groupId, 'exercises'] as const,
  exercise: (groupId: string, id: number) =>
    ['community', 'org', groupId, 'exercises', id] as const,
  agent: (groupId: string) => ['community', 'org', groupId, 'agent'] as const,
  benefits: (groupId: string) => ['community', 'org', groupId, 'benefits'] as const,
  /** A fila "Para revisar" dos desafios (Pn-13): só a equipe que revisa. */
  challengeReview: (groupId: string) =>
    ['community', 'org', groupId, 'challenges', 'review'] as const,
  moderation: (groupId: string) => ['community', 'org', groupId, 'moderation'] as const,
  reports: (groupId: string) => ['community', 'org', groupId, 'moderation', 'reports'] as const,
  removedPosts: (groupId: string) =>
    ['community', 'org', groupId, 'moderation', 'removed'] as const,
  bans: (groupId: string) => ['community', 'org', groupId, 'moderation', 'bans'] as const,
  polls: (groupId: string) => ['community', 'org', groupId, 'moderation', 'polls'] as const,
  announcements: (groupId: string) =>
    ['community', 'org', groupId, 'moderation', 'announcements'] as const,
  /** O painel base (#398): contadores do menu, visão geral e busca. */
  panelCounts: (groupId: string) => ['community', 'org', groupId, 'panel', 'counts'] as const,
  overview: (groupId: string, days: number) =>
    ['community', 'org', groupId, 'panel', 'overview', days] as const,
  panelSearch: (groupId: string, q: string) =>
    ['community', 'org', groupId, 'panel', 'search', q] as const,
  announcementSettings: (groupId: string) =>
    ['community', 'org', groupId, 'moderation', 'announcements', 'settings'] as const,
  announcementsRecent: (groupId: string) =>
    ['community', 'org', groupId, 'moderation', 'announcements', 'recent'] as const,
  /** Relatório do mês e origens dos convites (#400): só quem lê os agregados. */
  monthReport: (groupId: string, month: string | undefined) =>
    ['community', 'org', groupId, 'report', month ?? 'default'] as const,
  reportSettings: (groupId: string) => ['community', 'org', groupId, 'report', 'settings'] as const,
  inviteOrigins: (groupId: string, days: number) =>
    ['community', 'org', groupId, 'invites', 'origins', days] as const,
  insightsPanels: (groupId: string) => ['community', 'org', groupId, 'insights'] as const,
  insightsCuts: (groupId: string, panel: string) =>
    ['community', 'org', groupId, 'insights', panel] as const,
  insights: (groupId: string, panel: string, cut: string, period: string) =>
    ['community', 'org', groupId, 'insights', panel, cut, period] as const,
};
