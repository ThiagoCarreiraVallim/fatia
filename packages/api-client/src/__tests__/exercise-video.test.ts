import { describe, expect, it } from 'vitest';
import {
  exerciseDetailPath,
  exerciseIdFromParam,
  exerciseVideoSource,
  howToMeta,
  isYoutubeEmbedNavigation,
  embedNavigationAction,
  communityVideoRecovery,
  signedVideoIsStale,
  youtubeEmbedUrl,
  youtubeHeroThumbnails,
  youtubeWatchUrl,
} from '../exercise-video';
import { hasTopBar, navBarMode, routeInfo } from '../navigation';
import type { Exercise } from '../workout';

const base = {
  youtubeVideoId: null,
  youtubeVideoIdPt: null,
  community: null,
  equipment: 'barra',
  level: 'intermediate',
  mechanic: 'compound',
} as unknown as Exercise;

describe('vídeo do exercício', () => {
  it('o vídeo da comunidade vence o do YouTube e traz a URL assinada', () => {
    const ex = {
      ...base,
      youtubeVideoId: 'dQw4w9WgXcQ',
      community: { video: { url: 'https://media/x.mp4' } },
    } as unknown as Exercise;
    expect(exerciseVideoSource(ex)).toEqual({ kind: 'community', url: 'https://media/x.mp4' });
  });

  it('o YouTube em português vence o original', () => {
    const ex = { ...base, youtubeVideoId: 'aaaaaaaaaaa', youtubeVideoIdPt: 'bbbbbbbbbbb' };
    expect(exerciseVideoSource(ex as Exercise)).toEqual({ kind: 'youtube', id: 'bbbbbbbbbbb' });
  });

  it('sem vídeo, ou com ID inválido, não há vídeo', () => {
    expect(exerciseVideoSource(base)).toBeNull();
    expect(exerciseVideoSource(undefined)).toBeNull();
    expect(exerciseVideoSource({ ...base, youtubeVideoId: 'x"><script>' } as Exercise)).toBeNull();
  });

  it('o embed usa youtube-nocookie, toca na linha e não abre recomendações de fora', () => {
    const url = new URL(youtubeEmbedUrl('dQw4w9WgXcQ')!);
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('playsinline')).toBe('1');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('rel')).toBe('0');
  });

  it('ID que não é do YouTube não vira URL', () => {
    expect(youtubeEmbedUrl('../../evil')).toBeNull();
    expect(youtubeWatchUrl('abc')).toBeNull();
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('a capa do topo é 16:9, sem as faixas pretas do hqdefault (4:3)', () => {
    expect(youtubeHeroThumbnails('dQw4w9WgXcQ')).toEqual([
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg',
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    ]);
    expect(youtubeHeroThumbnails('nope')).toEqual([]);
  });

  it('a URL assinada é renovada antes de vencer', () => {
    const fetched = 1_000_000;
    expect(signedVideoIsStale(fetched, fetched + 60_000)).toBe(false);
    expect(signedVideoIsStale(fetched, fetched + 9 * 60_000 + 1)).toBe(true);
    expect(signedVideoIsStale(0, fetched)).toBe(true);
  });

  it('a linha de meta do Como fazer: equipamento · nível · mecânica', () => {
    expect(howToMeta(base)).toBe('barra · intermediário · composto');
    expect(howToMeta({ ...base, level: null, mechanic: 'isolation' } as Exercise)).toBe(
      'barra · isolado',
    );
  });
});

describe('a WebView do player só navega dentro do embed', () => {
  it('aceita o embed e o about:blank, recusa o resto (vai para o navegador)', () => {
    expect(
      isYoutubeEmbedNavigation('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'),
    ).toBe(true);
    expect(isYoutubeEmbedNavigation('about:blank')).toBe(true);
    expect(isYoutubeEmbedNavigation('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isYoutubeEmbedNavigation('https://www.youtube-nocookie.com.evil.com/embed/x')).toBe(
      false,
    );
    expect(isYoutubeEmbedNavigation('http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(
      false,
    );
    expect(isYoutubeEmbedNavigation('nada')).toBe(false);
  });
});

describe('Como fazer é uma tela (Al-T9)', () => {
  it('tem rota própria', () => {
    expect(exerciseDetailPath(42)).toBe('/workout/exercise/42');
  });

  it('é foco: sem barra de baixo e sem barra de topo (voltar e estrela sobre o vídeo)', () => {
    expect(navBarMode('/workout/exercise/42')).toBe('hidden');
    expect(hasTopBar('/workout/exercise/42')).toBe(false);
  });

  it('está no mapa de rotas, abaixo de Treino', () => {
    const info = routeInfo('/workout/exercise/42');
    expect(info.title).toBe('Como fazer');
    expect(info.parent).toBe('/workout');
  });
});

/** `/workout/exercise/<id>` com id que não é exercício: erro, não carregando para sempre. */
describe('exerciseIdFromParam', () => {
  it('aceita só inteiro positivo', () => {
    expect(exerciseIdFromParam('42')).toBe(42);
    expect(exerciseIdFromParam(['42'])).toBe(42);
  });

  it.each([undefined, '', 'abc', '0', '-3', '4.5', '1e3', ' 7'])('%s é inválido', (raw) => {
    expect(exerciseIdFromParam(raw)).toBeNull();
  });
});

/**
 * A WebView do YouTube só manda ao navegador um toque da pessoa no quadro
 * principal. Iframes de dentro do embed (anúncio, telemetria) e redirecionamentos
 * não abrem nada.
 */
describe('embedNavigationAction', () => {
  const embed = 'https://www.youtube-nocookie.com/embed/abc?autoplay=1';
  const site = 'https://www.youtube.com/watch?v=abc';
  const ios = { reportsClicks: true };
  const android = { reportsClicks: false };

  it('o próprio embed carrega', () => {
    expect(embedNavigationAction({ url: embed, isTopFrame: true }, ios)).toBe('load');
  });

  it('toque no quadro principal vai ao navegador', () => {
    expect(
      embedNavigationAction({ url: site, isTopFrame: true, navigationType: 'click' }, ios),
    ).toBe('browser');
    // O Android não diz se foi toque (`navigationType` é sempre `other`).
    expect(
      embedNavigationAction({ url: site, isTopFrame: true, navigationType: 'other' }, android),
    ).toBe('browser');
  });

  it('no iOS, o quadro principal sem toque é bloqueado sem abrir nada', () => {
    expect(
      embedNavigationAction({ url: site, isTopFrame: true, navigationType: 'other' }, ios),
    ).toBe('block');
  });

  it('iframe de dentro do embed nunca abre o navegador', () => {
    expect(
      embedNavigationAction(
        {
          url: 'https://googleads.g.doubleclick.net/x',
          isTopFrame: false,
          navigationType: 'click',
        },
        ios,
      ),
    ).toBe('load');
    expect(embedNavigationAction({ url: 'intent://x', isTopFrame: false }, android)).toBe('block');
  });
});

/**
 * O vídeo da comunidade toca por URL assinada de vida curta. Se o player falha
 * (URL vencida), busca uma URL nova antes de tentar de novo ou abrir o navegador.
 */
describe('communityVideoRecovery', () => {
  it('com URL nova, tenta de novo no player uma vez', () => {
    expect(communityVideoRecovery({ failedUrl: 'u1', freshUrl: 'u2', retried: false })).toEqual({
      action: 'retry',
      url: 'u2',
    });
  });

  it('se a URL nova também falha, abre a nova no navegador (nunca a vencida)', () => {
    expect(communityVideoRecovery({ failedUrl: 'u2', freshUrl: 'u3', retried: true })).toEqual({
      action: 'browser',
      url: 'u3',
    });
    expect(communityVideoRecovery({ failedUrl: 'u1', freshUrl: 'u1', retried: false })).toEqual({
      action: 'browser',
      url: 'u1',
    });
  });

  it('sem URL nova (o vídeo saiu ou a busca falhou), volta para a capa', () => {
    expect(communityVideoRecovery({ failedUrl: 'u1', freshUrl: null, retried: false })).toEqual({
      action: 'poster',
    });
  });
});
