import { describe, expect, it } from 'vitest';
import { createFollowEnd, isNearEnd } from '../follow-end';

/** A posição de uma lista de 1000 px numa tela de 600: o fim é o `y` 400. */
const em = (y: number) => ({
  contentOffset: { y },
  layoutMeasurement: { height: 600 },
  contentSize: { height: 1000 },
});

/** #486: a rolagem só acompanha a resposta de quem está no fim da conversa. */
describe('isNearEnd', () => {
  it('no fim, ou a menos de um respiro dele: perto', () => {
    expect(isNearEnd(em(400))).toBe(true);
    expect(isNearEnd(em(330))).toBe(true);
  });
  it('lendo mais acima: longe', () => {
    expect(isNearEnd(em(100))).toBe(false);
  });
  it('conteúdo menor que a tela: sempre perto', () => {
    expect(
      isNearEnd({
        contentOffset: { y: 0 },
        layoutMeasurement: { height: 600 },
        contentSize: { height: 200 },
      }),
    ).toBe(true);
  });
});

describe('createFollowEnd', () => {
  it('começa seguindo o fim', () => {
    expect(createFollowEnd().following).toBe(true);
  });
  it('quem sobe arrastando para de seguir; ao voltar ao fim, segue de novo', () => {
    const f = createFollowEnd();
    f.dragStart();
    f.scroll(em(380));
    f.scroll(em(100));
    f.dragEnd(em(100));
    expect(f.following).toBe(false);
    f.dragStart();
    f.dragEnd(em(400));
    expect(f.following).toBe(true);
  });
  it('a inércia depois do arrasto também decide', () => {
    const f = createFollowEnd();
    f.dragStart();
    f.dragEnd(em(390));
    f.momentumStart();
    f.scroll(em(50));
    f.momentumEnd(em(20));
    expect(f.following).toBe(false);
  });
  it('a rolagem do próprio app (o scrollToEnd no meio da animação) não para de seguir', () => {
    const f = createFollowEnd();
    f.scroll(em(0));
    expect(f.following).toBe(true);
  });
  it('mandar mensagem volta a seguir o fim', () => {
    const f = createFollowEnd();
    f.dragStart();
    f.dragEnd(em(0));
    expect(f.following).toBe(false);
    f.followAgain();
    expect(f.following).toBe(true);
  });
});
