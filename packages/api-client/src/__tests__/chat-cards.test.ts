import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_TEXTS,
  AI_CONSENT_VERSIONS,
  appOnlyHref,
  chatCardTitle,
  collapsedLabel,
  isEmptyChatArtifact,
  groupConversationsByDay,
  groupToolCalls,
  quickReplies,
  type ChatToolCatalogEntry,
} from '../chat-cards';
import { CHAT_ERROR_CODES, textoDeErroDoChat } from '../chat';

const apagarRefeicao: ChatToolCatalogEntry = {
  title: 'Apagar refeição',
  kind: 'app_only',
  appOnly: { screen: 'Ações da refeição', path: '/nutrition/meals/:id' },
};

describe('appOnlyHref — o botão "Abrir" do só no app (#384)', () => {
  it('troca o `:campo` pelo argumento de mesmo nome, com escape', () => {
    expect(appOnlyHref(apagarRefeicao, { id: 'm 1' })).toBe('/nutrition/meals/m%201');
  });

  it('sem o argumento, abre a tela-mãe em vez de um link quebrado', () => {
    expect(appOnlyHref(apagarRefeicao, {})).toBe('/nutrition');
    expect(
      appOnlyHref(
        {
          title: 'Sair',
          kind: 'app_only',
          appOnly: { screen: 'Sobre', path: '/community/:groupId/settings' },
        },
        {},
      ),
    ).toBe('/community');
  });

  it('sem tela declarada não há botão', () => {
    expect(appOnlyHref({ title: 'x', kind: 'app_only' }, {})).toBeNull();
    expect(appOnlyHref(undefined, {})).toBeNull();
  });
});

describe('groupToolCalls — "Consultei N coisas" (#384, prancha IA-Estados)', () => {
  const ok = (id: string) => ({ id, status: 'done' as const });

  it('duas ou mais seguidas e terminadas fecham num grupo', () => {
    expect(groupToolCalls([ok('a'), ok('b'), ok('c')])).toEqual([
      { type: 'group', items: [ok('a'), ok('b'), ok('c')] },
    ]);
  });

  it('uma só fica solta, e nada agrupa enquanto roda ou com falha', () => {
    expect(groupToolCalls([ok('a')])).toEqual([{ type: 'single', item: ok('a') }]);
    const rodando = { id: 'r', status: 'running' as const };
    expect(groupToolCalls([ok('a'), rodando])).toEqual([
      { type: 'single', item: ok('a') },
      { type: 'single', item: rodando },
    ]);
    const falha = { id: 'f', status: 'error' as const };
    expect(groupToolCalls([ok('a'), ok('b'), falha])).toEqual([
      { type: 'single', item: ok('a') },
      { type: 'single', item: ok('b') },
      { type: 'single', item: falha },
    ]);
  });

  it('o rótulo do grupo concorda com o número', () => {
    expect(collapsedLabel(1)).toBe('Consultei 1 coisa');
    expect(collapsedLabel(5)).toBe('Consultei 5 coisas');
  });
});

describe('quickReplies — as pílulas acima do campo (#384)', () => {
  it('na pausa de continuar, as duas saídas', () => {
    expect(
      quickReplies({ interrupt: { kind: 'continue', prompt: 'Continuo?', actions: [] } }),
    ).toEqual(['Continuar', 'Parar aqui']);
  });

  it('numa pergunta de escolha, as opções do único campo', () => {
    expect(
      quickReplies({
        interrupt: {
          kind: 'question',
          prompt: 'Qual?',
          actions: [
            {
              kind: 'question',
              toolCallId: 'q',
              messageId: 'm',
              prompt: 'Qual?',
              fields: [
                { name: 'r', label: 'Refeição', type: 'select', options: ['Almoço', 'Jantar'] },
              ],
            },
          ],
        },
      }),
    ).toEqual(['Almoço', 'Jantar']);
  });

  it('depois de uma consulta, o próximo passo da área; sem nada, nenhuma pílula', () => {
    expect(quickReplies({ lastTool: 'get_week_summary' })).toEqual([
      'E a alimentação?',
      'Ver o dia',
    ]);
    expect(quickReplies({})).toEqual([]);
    expect(quickReplies({ lastTool: 'ferramenta_desconhecida' })).toEqual([]);
  });

  it('enquanto responde, nada', () => {
    expect(quickReplies({ running: true, lastTool: 'get_week_summary' })).toEqual([]);
  });
});

describe('groupConversationsByDay — Hoje, Esta semana e Antes (#384)', () => {
  it('separa pela data local, na ordem que veio', () => {
    const agora = new Date(2026, 10, 17, 10, 0);
    const c = (id: string, d: Date) => ({ id, updatedAt: d.toISOString() });
    const grupos = groupConversationsByDay(
      [
        c('hoje', new Date(2026, 10, 17, 8, 0)),
        c('ontem', new Date(2026, 10, 16, 22, 0)),
        c('velha', new Date(2026, 10, 1, 9, 0)),
      ],
      agora,
    );
    expect(grupos.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Hoje', ['hoje']],
      ['Esta semana', ['ontem']],
      ['Antes', ['velha']],
    ]);
  });
});

describe('textos dos aceites (#384)', () => {
  it('a versão é a mesma da API, e o texto nomeia o provedor e a busca de verdade', () => {
    expect(AI_CONSENT_VERSIONS).toEqual({ chat: '2026-11-16', webSearch: '2026-11-16' });
    expect(AI_CONSENT_TEXTS.chat.body).toContain('OpenRouter');
    expect(AI_CONSENT_TEXTS.chat.body).toContain('GLM 5.3 Flash');
    expect(AI_CONSENT_TEXTS.chat.body).not.toContain('[');
    expect(AI_CONSENT_TEXTS.webSearch.body).toContain('Exa');
    // A retenção zero não cobre a busca: o texto diz isso, sem prometer o que não vale.
    expect(AI_CONSENT_TEXTS.webSearch.body).toMatch(/não vale para a busca/);
  });

  it('o 403 do aceite tem texto próprio', () => {
    expect(CHAT_ERROR_CODES).toContain('AI_CONSENT_REQUIRED');
    expect(textoDeErroDoChat({ code: 'AI_CONSENT_REQUIRED' })).toMatch(/aceite/i);
  });
});

describe('chatCardTitle e isEmptyChatArtifact — o título do cartão e o "nada encontrado"', () => {
  const t = 'c1';
  it('o resultado vira o título, em pt-BR', () => {
    expect(
      chatCardTitle({ toolCallId: t, kind: 'metric', label: 'Calorias de hoje', value: 934 }),
    ).toBe('Calorias de hoje');
    expect(chatCardTitle({ toolCallId: t, kind: 'metric', value: 934.4, unit: 'kcal' })).toBe(
      '934,4 kcal',
    );
    expect(
      chatCardTitle({ toolCallId: t, kind: 'bars', unit: 'passos', average: 8884, bars: [] }),
    ).toBe('8.884 passos por dia');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'timeline',
        unit: 'kg',
        events: [
          { date: '2026-10-06', value: 72.7 },
          { date: '2026-11-04', value: 70.2 },
        ],
      }),
    ).toBe('70,2 kg');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'badges',
        badges: [],
        unlocked: 7,
        total: 9,
      }),
    ).toBe('7 de 9 desbloqueadas');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'progress',
        items: [{ title: 'a', percent: 54 }],
      }),
    ).toBe('1 meta');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'sources',
        sources: [
          { title: 'a', url: 'https://a', domain: 'a' },
          { title: 'b', url: 'https://b', domain: 'b' },
        ],
      }),
    ).toBe('Fontes · 2 sites');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'scoreboard',
        label: 'Semana ativa',
        entries: [{ position: 3, name: 'Você', value: 5, you: true }],
      }),
    ).toBe('Semana ativa · você em 3º');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'range',
        rows: [
          { label: 'Calorias', value: 934, min: 1700, max: 1900 },
          { label: 'Fibra', value: 30, min: 25, max: 40 },
        ],
      }),
    ).toBe('1 fora da faixa');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'range',
        rows: [{ label: 'Fibra', value: 30, min: 25, max: 40 }],
      }),
    ).toBe('Hoje, na faixa');
    expect(
      chatCardTitle({
        toolCallId: t,
        kind: 'app_only',
        tool: 'delete_meal',
        title: 'Excluir refeição',
        params: {},
      }),
    ).toBe('Excluir refeição é pelo app');
  });

  it('vazio é o cartão sem linhas; métrica, arquivo e só no app nunca são vazios', () => {
    expect(isEmptyChatArtifact({ toolCallId: t, kind: 'report', columns: ['a'], rows: [] })).toBe(
      true,
    );
    expect(isEmptyChatArtifact({ toolCallId: t, kind: 'timeline', events: [] })).toBe(true);
    expect(isEmptyChatArtifact({ toolCallId: t, kind: 'list', items: [{ title: 'x' }] })).toBe(
      false,
    );
    expect(isEmptyChatArtifact({ toolCallId: t, kind: 'metric', value: 0 })).toBe(false);
    expect(
      isEmptyChatArtifact({ toolCallId: t, kind: 'file', url: 'u', filename: 'f', expiresAt: '' }),
    ).toBe(false);
  });
});
