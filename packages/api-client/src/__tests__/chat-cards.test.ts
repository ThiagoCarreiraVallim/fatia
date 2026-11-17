import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_TEXTS,
  AI_CONSENT_VERSIONS,
  appOnlyHref,
  collapsedLabel,
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
