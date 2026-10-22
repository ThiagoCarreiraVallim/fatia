import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: nav.redirect }));

import CommunityFeedRedirect from '../page';

describe('/community/[groupId]/feed', () => {
  it('redireciona para a raiz da comunidade, que é o mural (avisos e links antigos)', async () => {
    await CommunityFeedRedirect({ params: Promise.resolve({ groupId: 'g1' }) });
    expect(nav.redirect).toHaveBeenCalledWith('/community/g1');
  });
});
