import type { NewsFeed } from '@fatia/api-client';

/**
 * A última lista de novidades que chegou, para a V11b ("Sem conexão · Mostrando
 * o que já estava salvo"). Só conveniência deste navegador: o lido/não lido de
 * verdade mora na API. Leitura e escrita protegidas — aba anônima e cota cheia
 * não podem derrubar a tela.
 */
const KEY = 'fatia:you:news';

/** A mesma consulta para o selo de Você e a tela de Novidades. */
export const NEWS_QUERY_KEY = ['you', 'news'] as const;

export interface CachedNews {
  feed: NewsFeed;
  /** ISO de quando foi salvo. */
  savedAt: string;
}

export function readNewsCache(): CachedNews | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNews;
    return Array.isArray(parsed?.feed?.items) && typeof parsed.savedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeNewsCache(feed: NewsFeed, now = new Date()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ feed, savedAt: now.toISOString() }));
  } catch {
    // Sem armazenamento, sem cópia: a tela continua igual com internet.
  }
}

/**
 * O que mostrar sem conexão: a cópia salva, sem nenhum "novo" — não dá para
 * saber o que foi lido em outro aparelho, e a prancha V11b mostra assim.
 */
export function offlineFeed(cached: CachedNews): NewsFeed {
  return {
    items: cached.feed.items.map((i) => ({ ...i, unread: false })),
    unreadCount: 0,
  };
}
