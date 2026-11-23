import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMUNITY_SECTIONS,
  GROUP_TYPE_OPTIONS,
  JOIN_POLICY_OPTIONS,
  MEAL_PHOTOS_LOCKED,
  REQUIRED_SCOPE_ITEMS,
  VISIBILITY_OPTIONS,
  isSectionHidden,
  sectionSubtitle,
  sectionToast,
  teamSummaryLabel,
  timezoneOptions,
  toggleSection,
  visibleCommunityPlans,
  visibleCommunityTips,
} from '../community-settings';
import { communityTabs } from '../community-feed';
import { contentApi } from '../community-content';
import { orgApi } from '../community-admin';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

describe('configurações da comunidade no cliente (#413, Pn-15)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('as seções da prancha, na ordem, com ícone e o que cada uma esconde', () => {
    expect(COMMUNITY_SECTIONS.map((s) => [s.key, s.label, s.sub, s.icon])).toEqual([
      ['NUTRITION_TIPS', 'Dicas de nutrição', 'Planos e dicas › Nutrição', 'apple'],
      ['NUTRITION_PLANS', 'Planos alimentares', 'Adotar alimentação', 'book'],
      ['CHALLENGES', 'Desafios', 'aba Desafios e ranking', 'trophy'],
      ['FEED', 'Mural', 'posts, enquetes e comunicados no app', 'mega'],
      ['AGENDA', 'Agenda', 'aulas e eventos', 'cal'],
    ]);
  });

  it('esconder e mostrar: ordem canônica, subtítulo e o toast que promete que nada some', () => {
    expect(toggleSection([], 'FEED')).toEqual(['FEED']);
    expect(toggleSection(['FEED'], 'NUTRITION_TIPS')).toEqual(['NUTRITION_TIPS', 'FEED']);
    expect(toggleSection(['NUTRITION_TIPS', 'FEED'], 'FEED')).toEqual(['NUTRITION_TIPS']);
    expect(isSectionHidden({ hiddenSections: ['CHALLENGES'] }, 'CHALLENGES')).toBe(true);
    // API antiga, sem o campo: nada escondido.
    expect(isSectionHidden({}, 'CHALLENGES')).toBe(false);
    expect(sectionSubtitle('CHALLENGES', true)).toBe('escondida para os membros');
    expect(sectionSubtitle('CHALLENGES', false)).toBe('aba Desafios e ranking');
    expect(sectionToast('CHALLENGES', true)).toBe('Desafios escondida · nada some do app do aluno');
    expect(sectionToast('CHALLENGES', false)).toBe('Desafios aparece de novo');
  });

  it('as abas do membro seguem as seções; sem lista, as quatro de sempre', () => {
    const abas = (h?: Parameters<typeof communityTabs>[1]) =>
      communityTabs('g1', h).map((t) => t.tab);
    expect(abas()).toEqual(['feed', 'for-you', 'challenges', 'content']);
    expect(abas(['CHALLENGES'])).toEqual(['feed', 'for-you', 'content']);
    expect(abas(['FEED'])).toEqual(['for-you', 'challenges', 'content']);
    // Esconder nutrição filtra dentro de Conteúdo, mas a aba fica (treino e exercícios).
    expect(abas(['NUTRITION_TIPS', 'NUTRITION_PLANS'])).toEqual([
      'feed',
      'for-you',
      'challenges',
      'content',
    ]);
  });

  it('dentro de Conteúdo: some a nutrição escondida, fica o resto', () => {
    const dicas = [
      { id: 'a', category: 'NUTRITION' as const },
      { id: 'b', category: 'WORKOUT' as const },
    ];
    const planos = [
      { id: 'p', kind: 'NUTRITION' as const },
      { id: 'q', kind: 'WORKOUT' as const },
    ];
    expect(visibleCommunityTips(dicas, ['NUTRITION_TIPS']).map((d) => d.id)).toEqual(['b']);
    expect(visibleCommunityTips(dicas, []).map((d) => d.id)).toEqual(['a', 'b']);
    expect(visibleCommunityPlans(planos, ['NUTRITION_PLANS']).map((p) => p.id)).toEqual(['q']);
    expect(visibleCommunityPlans(planos, undefined).map((p) => p.id)).toEqual(['p', 'q']);
  });

  it('acesso: os segmentados da prancha, com a explicação de cada porta', () => {
    expect(GROUP_TYPE_OPTIONS.map((o) => o.label)).toEqual(['Patrocinada (paga o PRO)', 'Social']);
    expect(VISIBILITY_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ['PUBLIC', 'Pública'],
      ['PRIVATE', 'Privada'],
    ]);
    expect(JOIN_POLICY_OPTIONS.map((o) => [o.value, o.label, o.hint])).toEqual([
      ['OPEN', 'Aberta', 'Qualquer pessoa com o código entra na hora.'],
      [
        'APPROVAL',
        'Com aprovação',
        'Com o código ou o QR, a pessoa pede e a equipe ou a recepção aprova.',
      ],
      ['INVITE_ONLY', 'Só convite', 'Só entra quem recebe um convite.'],
    ]);
  });

  it('o que o membro precisa compartilhar: fotos das refeições nunca é obrigatória', () => {
    expect(REQUIRED_SCOPE_ITEMS.map((i) => [i.scope, i.label, i.sub, i.locked])).toEqual([
      ['WORKOUT', 'Treino', 'Planos, sessões e volume', false],
      ['NUTRITION', 'Alimentação', 'Refeições e totais do dia', false],
      ['BODY', 'Corpo', 'Peso, medidas e avaliações', false],
      ['HABITS', 'Hábitos', 'Água, passos e hábitos', false],
      ['GOALS', 'Metas', 'Metas e objetivos', false],
      ['MEAL_PHOTOS', 'Fotos das refeições', 'Nunca obrigatória · só quem guarda as fotos', true],
    ]);
    expect(MEAL_PHOTOS_LOCKED).toBe('Fotos das refeições não pode ser obrigatória');
  });

  it('fuso: os do Brasil com a cidade e a hora; o atual fora da lista entra no topo', () => {
    const br = timezoneOptions('America/Cuiaba');
    expect(br.find((o) => o.value === 'America/Cuiaba')?.label).toBe('Cuiabá (−4)');
    expect(br.find((o) => o.value === 'America/Sao_Paulo')?.label).toBe('São Paulo (−3)');
    expect(br.find((o) => o.value === 'America/Noronha')?.label).toBe('Noronha (−2)');
    expect(br.find((o) => o.value === 'America/Rio_Branco')?.label).toBe('Rio Branco (−5)');
    const fora = timezoneOptions('Europe/Lisbon');
    expect(fora[0]).toEqual({ value: 'Europe/Lisbon', label: 'Lisbon' });
    expect(fora.length).toBe(br.length + 1);
  });

  it('o resumo da equipe junta dono e admin, e diz zero com palavras', () => {
    expect(teamSummaryLabel({ OWNER: 1, ADMIN: 1, PROFESSIONAL: 6, RECEPTION: 4 })).toBe(
      '12 pessoas · 2 donos e admins, 6 profissionais, 4 na recepção',
    );
    expect(teamSummaryLabel({ OWNER: 1 })).toBe('1 pessoa · 1 dono');
    expect(teamSummaryLabel({ OWNER: 1, PROFESSIONAL: 1 })).toBe(
      '2 pessoas · 1 dono, 1 profissional',
    );
  });

  it('salva marca, seções e tipo no PATCH, e a capa na rota dela', async () => {
    await orgApi.update('g1', {
      brandColor: '#1d4ed8',
      hiddenSections: ['FEED'],
      type: 'SOCIAL',
    });
    await orgApi.setCover('g1', 'f1');
    await orgApi.setCover('g1', null);
    await contentApi.setAvatar('g1', 'f2');
    expect(pedido(0)).toEqual({
      method: 'PATCH',
      url: '/api/groups/g1',
      body: { brandColor: '#1d4ed8', hiddenSections: ['FEED'], type: 'SOCIAL' },
    });
    expect(pedido(1)).toEqual({
      method: 'PUT',
      url: '/api/groups/g1/cover',
      body: { fileId: 'f1' },
    });
    expect(pedido(2).body).toEqual({ fileId: null });
  });
});
