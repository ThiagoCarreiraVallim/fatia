import { describe, expect, it } from 'vitest';
import {
  AUTO_POST_LABEL,
  FEED_FILTER_LABEL,
  activeCommunityTab,
  announcementSlots,
  communityTabs,
  pinDeadlineLabel,
  pollClosesLabel,
  pollProblem,
  pollResultNote,
  repeatOptions,
  type PollView,
} from '../community-feed';

const poll = (over: Partial<PollView> = {}): PollView => ({
  question: 'Qual horário?',
  closesAt: '2026-11-20T15:00:00Z',
  closed: false,
  myOptionId: null,
  totalVotes: null,
  options: [
    { id: 'a', label: 'Manhã', percent: null },
    { id: 'b', label: 'Noite', percent: null },
  ],
  canClose: false,
  ...over,
});

describe('mural #394: enquete, avisos, comunicados e abas', () => {
  const agora = new Date('2026-11-17T15:00:00Z');

  it('enquete: pergunta, 2 a 4 opções, sem repetida e nos limites', () => {
    expect(pollProblem('', ['a', 'b'])).toBe('Escreva a pergunta.');
    expect(pollProblem('Qual?', ['a', ' '])).toBe('A enquete tem de 2 a 4 opções.');
    expect(pollProblem('Qual?', ['a', 'b', 'c', 'd', 'e'])).toBe('A enquete tem de 2 a 4 opções.');
    expect(pollProblem('Qual?', ['Sim', 'sim '])).toBe('Cada opção aparece uma vez.');
    expect(pollProblem('x'.repeat(201), ['a', 'b'])).toBe('A pergunta tem até 200 caracteres.');
    expect(pollProblem('Qual?', ['a', 'x'.repeat(81)])).toBe('Cada opção tem até 80 caracteres.');
    expect(pollProblem('Qual?', ['a', 'b', ''])).toBeNull();
  });

  it('resultado só com 5 votos: a amostra pequena tem recado próprio', () => {
    expect(pollResultNote(poll())).toBe('Vote para ver o resultado');
    expect(pollResultNote(poll({ myOptionId: 'a' }))).toBe(
      'Amostra pequena demais para mostrar · o resultado aparece com 5 votos',
    );
    expect(pollResultNote(poll({ closed: true }))).toBe(
      'Amostra pequena demais para mostrar · o resultado aparece com 5 votos',
    );
    expect(pollResultNote(poll({ myOptionId: 'a', totalVotes: 12 }))).toBe('12 votos');
    expect(pollResultNote(poll({ closed: true, totalVotes: 5 }))).toBe('5 votos · encerrada');
  });

  it('prazo da enquete', () => {
    expect(pollClosesLabel(poll(), agora)).toBe('Encerra em 3 dias');
    expect(pollClosesLabel(poll({ closesAt: '2026-11-17T20:00:00Z' }), agora)).toBe('Encerra hoje');
    expect(pollClosesLabel(poll({ closesAt: '2026-11-18T16:00:00Z' }), agora)).toBe(
      'Encerra amanhã',
    );
    expect(pollClosesLabel(poll({ closed: true }), agora)).toBe('Encerrada');
  });

  it('aviso fixado: com prazo ou sem', () => {
    expect(pinDeadlineLabel(null)).toBe('Fixado');
    expect(pinDeadlineLabel('2026-11-20T15:00:00Z')).toBe('Fixado até 20 nov');
  });

  it('horários do comunicado em blocos de 15 min, só no futuro', () => {
    const slots = announcementSlots(new Date(2026, 10, 17), new Date(2026, 10, 17, 22, 7));
    expect(slots.map((s) => s.label)).toEqual([
      '22:15',
      '22:30',
      '22:45',
      '23:00',
      '23:15',
      '23:30',
      '23:45',
    ]);
    expect(new Date(slots[0]!.iso).getMinutes()).toBe(15);
    expect(announcementSlots(new Date(2026, 10, 18), new Date(2026, 10, 17, 22, 7))).toHaveLength(
      96,
    );
    expect(announcementSlots(new Date(2026, 10, 16), new Date(2026, 10, 17, 22, 7))).toEqual([]);
  });

  it('repetir: o dia da semana e do mês saem do primeiro horário', () => {
    // 17/11/2026 é terça.
    expect(repeatOptions(new Date(2026, 10, 17, 9, 0)).map((o) => [o.value, o.label])).toEqual([
      ['NONE', 'Não repetir'],
      ['DAILY', 'Todo dia'],
      ['WEEKLY', 'Toda terça'],
      ['MONTHLY', 'Todo dia 17'],
    ]);
    expect(repeatOptions(new Date(2026, 10, 21, 9, 0))[2]!.label).toBe('Todo sábado');
  });

  it('filtros do mural com os nomes da prancha', () => {
    expect(FEED_FILTER_LABEL).toEqual({
      all: 'Tudo',
      team: 'Equipe',
      content: 'Conteúdo novo',
      members: 'Membros',
    });
  });

  it('abas: Mural, Para você, Desafios e Conteúdo (Agenda chega com a #397)', () => {
    expect(communityTabs('g1').map((t) => [t.tab, t.label, t.href])).toEqual([
      ['feed', 'Mural', '/community/g1'],
      ['for-you', 'Para você', '/community/g1/for-you'],
      ['challenges', 'Desafios', '/community/g1/challenges'],
      ['content', 'Conteúdo', '/community/g1/content'],
    ]);
    expect(activeCommunityTab('/community/g1/for-you')).toBe('for-you');
  });
});

describe('painel: Comunicados e enquetes (#394)', () => {
  it('é do dono e do profissional, que comunicam (announcement.publish)', async () => {
    const { panelSections, panelHref, activePanelSection } = await import('../community-panel');
    for (const role of ['OWNER', 'PROFESSIONAL'] as const) {
      expect(panelSections(role).find((s) => s.section === 'announcements')).toMatchObject({
        label: 'Comunicados e enquetes',
        path: '/announcements',
      });
    }
    expect(panelHref('g1', 'announcements')).toBe('/org/g1/announcements');
    expect(activePanelSection('/org/g1/announcements')).toBe('announcements');
  });

  it('posts automáticos: os quatro tipos com o nome da prancha Pn-14', () => {
    expect(
      Object.fromEntries(Object.entries(AUTO_POST_LABEL).map(([k, v]) => [k, v.label])),
    ).toEqual({
      PLAN: 'Plano novo publicado',
      TIP: 'Dica nova',
      EXERCISE: 'Exercício novo no guia',
      CHALLENGE: 'Desafio começa',
    });
  });
});
