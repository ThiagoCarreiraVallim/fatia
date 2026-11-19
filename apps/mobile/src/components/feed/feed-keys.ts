/** As chaves do mural no React Query, num arquivo só (o poll-block e o feed-ui usam). */
export const feedKey = (groupId: string) => ['community', 'feed', groupId] as const;
/** A lista do mural com um filtro. Sob `feedKey`: invalidar o mural recarrega todos. */
export const feedListKey = (groupId: string, filter: string) =>
  ['community', 'feed', groupId, 'list', filter] as const;
export const forYouKey = (groupId: string) => ['community', 'for-you', groupId] as const;
export const postKey = (groupId: string, id: string) => ['community', 'feed', groupId, id] as const;
