import { describe, expect, it } from 'vitest';
import type { NewsFeed } from '@fatia/api-client';
import { offlineFeed, parseNewsCache } from '../news-feed';

const FEED: NewsFeed = {
  items: [
    {
      id: 'unidades',
      date: '2026-11-10',
      title: 'Unidades',
      body: 'Carga em kg ou lb.',
      icon: 'ruler',
      tone: 'lime',
      href: '/you/units',
      unread: true,
    },
  ],
  unreadCount: 1,
};

describe('cópia de Novidades sem conexão (Al-V11b)', () => {
  it('lê o que foi salvo e recusa lixo', () => {
    const raw = JSON.stringify({ feed: FEED, savedAt: '2026-11-09T10:00:00Z' });
    expect(parseNewsCache(raw)?.feed.items).toHaveLength(1);
    expect(parseNewsCache('{')).toBeNull();
    expect(parseNewsCache(JSON.stringify({ feed: {} }))).toBeNull();
    expect(parseNewsCache(null)).toBeNull();
  });

  it('offline não mostra nenhum "novo"', () => {
    const feed = offlineFeed({ feed: FEED, savedAt: '2026-11-09T10:00:00Z' });
    expect(feed.unreadCount).toBe(0);
    expect(feed.items.every((i) => !i.unread)).toBe(true);
  });
});
