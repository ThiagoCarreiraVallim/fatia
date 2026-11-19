import { describe, expect, it } from 'vitest';
import {
  exerciseDetailPath,
  exerciseVideoSource,
  howToMeta,
  signedVideoIsStale,
  youtubeEmbedUrl,
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
