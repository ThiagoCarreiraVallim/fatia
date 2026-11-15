import type { NewsFeed } from '@fatia/api-client';

/**
 * A parte pura da cópia de Novidades (sem `expo-file-system`), testável em
 * Node: ler o JSON salvo e montar a lista da V11b.
 */
export const NEWS_QUERY_KEY = ['you', 'news'] as const;

export interface CachedNews {
  feed: NewsFeed;
  savedAt: string;
}

export function parseNewsCache(raw: string | null | undefined): CachedNews | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedNews;
    return Array.isArray(parsed?.feed?.items) && typeof parsed.savedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Sem conexão: a cópia salva, sem nenhum "novo" (prancha V11b). */
export function offlineFeed(cached: CachedNews): NewsFeed {
  return {
    items: cached.feed.items.map((i) => ({ ...i, unread: false })),
    unreadCount: 0,
  };
}
