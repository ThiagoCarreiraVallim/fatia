import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_TEXTS,
  AI_CONSENT_VERSIONS,
  aiConsentBody,
  appOnlyHref,
  chatCardTitle,
  collapsedLabel,
  chatArtifactAsksAction,
  isDestructiveChatTool,
  isEmptyChatArtifact,
  isRenderableChatArtifact,
  pauseDecisionCount,
  webConsentToSaveOnSend,
  lastToolName,
  toolCallStatusOf,
  toolLineLabel,
  webSearchLineLabel,
  cardEyebrow,
  timelineAxisLabels,
  barAxisLabels,
  timelinePeriodLabel,
  groupConversationsByDay,
  groupToolCalls,
  quickReplies,
  type ChatToolCatalogEntry,
} from '../chat-cards';
import { CHAT_ERROR_CODES, textoDeErroDoChat, type ChatArtifact } from '../chat';
import { AI_SETTINGS_COPY } from '../ai-settings';

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

describe('isDestructiveChatTool — o cartão de exclusão (#490, ADR 051)', () => {
  it('segue o catálogo quando ele conhece a tool', () => {
    const catalogo = {
      delete_meal: {
        title: 'Excluir refeição',
        kind: 'confirm' as const,
        destructive: true as const,
      },
      update_meal: { title: 'Editar refeição', kind: 'confirm' as const },
    };
    expect(isDestructiveChatTool(catalogo, 'delete_meal')).toBe(true);
    expect(isDestructiveChatTool(catalogo, 'update_meal')).toBe(false);
  });

  it('sem o catálogo, decide pelo nome: nunca trata exclusão como escrita comum', () => {
    expect(isDestructiveChatTool(undefined, 'delete_set')).toBe(true);
    expect(isDestructiveChatTool(undefined, 'remove_exercise_from_plan')).toBe(true);
    expect(isDestructiveChatTool({}, 'delete_meal')).toBe(true);
    expect(isDestructiveChatTool(undefined, 'log_meal')).toBe(false);
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

const HASH_CHAT = '4e35b2fd';
const HASH_BUSCA = 'd104c22f';

describe('textos dos aceites (#384)', () => {
  // FNV-1a de 32 bits do texto: basta para notar que ele mudou.
  const sha = (valor: unknown) => {
    let h = 0x811c9dc5;
    for (const c of JSON.stringify(valor)) {
      h ^= c.codePointAt(0)!;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  };

  it('mudar o texto sem subir a versão falha: quem leu o texto antigo não aceitou o novo', () => {
    // Mudou o texto? Suba a versão aqui e em `AI_CONSENT_VERSIONS` da API, e só então troque
    // o hash. Todo mundo verá o aceite de novo.
    expect({ versao: AI_CONSENT_VERSIONS.chat, texto: sha(AI_CONSENT_TEXTS.chat) }).toEqual({
      versao: '2026-11-17',
      texto: HASH_CHAT,
    });
    expect({
      versao: AI_CONSENT_VERSIONS.webSearch,
      texto: sha(AI_CONSENT_TEXTS.webSearch),
    }).toEqual({ versao: '2026-11-24', texto: HASH_BUSCA });
  });

  it('o rodapé da busca aponta para onde a chave mora agora, não para o globo que saiu do topo (#487)', () => {
    expect(AI_CONSENT_TEXTS.webSearch.footnote).not.toMatch(/globo|topo do chat/);
    expect(AI_CONSENT_TEXTS.webSearch.footnote).toContain(AI_SETTINGS_COPY.title);
  });

  it('os nomes do provedor, do modelo e da busca vêm da API, não do texto', () => {
    const nomes = { provider: 'Prov', model: 'Mod X', searchEngine: 'Busca Y' };
    const chat = aiConsentBody('chat', nomes);
    expect(chat).toContain('Prov');
    expect(chat).toContain('Mod X');
    expect(chat).not.toMatch(/[{}]/);
    const busca = aiConsentBody('web_search', nomes);
    expect(busca).toContain('Busca Y');
    expect(busca).toContain('Prov');
    expect(busca).not.toMatch(/[{}]/);
    for (const corpo of [AI_CONSENT_TEXTS.chat.body, AI_CONSENT_TEXTS.webSearch.body]) {
      expect(corpo).not.toMatch(/OpenRouter|GLM|Z\.ai|Exa/);
    }
  });

  it('a busca diz de onde sai a pergunta e que a retenção zero não vale para ela', () => {
    const busca = aiConsentBody('web_search', {
      provider: 'P',
      model: 'M',
      searchEngine: 'S',
    });
    expect(busca).toMatch(/última mensagem/);
    expect(busca).toMatch(/não vale para a busca/);
    // Não promete o que não dá para garantir.
    expect(aiConsentBody('chat', { provider: 'P', model: 'M', searchEngine: 'S' })).not.toMatch(
      /Só usamos servidores que não guardam/,
    );
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
        tool: 'leave_group',
        title: 'Sair de um grupo',
        params: {},
      }),
    ).toBe('Sair de um grupo é pelo app');
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

describe('toolCallStatusOf, toolLineLabel e lastToolName — a linha da tool no app (#384)', () => {
  const metrica = { toolCallId: 'c1', kind: 'metric' as const, value: 934, unit: 'kcal' };
  const vazia = { toolCallId: 'c1', kind: 'report' as const, columns: ['a'], rows: [] };

  it('o desfecho gravado vira o estado da linha, e consulta vazia é "empty"', () => {
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'running' })).toBe('running');
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'success' }, metrica)).toBe('done');
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'success' }, vazia)).toBe('empty');
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'error' })).toBe('error');
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'refused' })).toBe('declined');
    expect(toolCallStatusOf({ id: 'c1', name: 'x', status: 'not_run' })).toBe('not_run');
    expect(toolLineLabel('Salvar refeição', 'not_run')).toBe(
      'Salvar refeição · não chegou a rodar',
    );
  });

  it('o texto da linha segue a prancha IA-Estados', () => {
    expect(toolLineLabel('Resumo de hoje', 'running')).toBe('Consultando Resumo de hoje…');
    expect(toolLineLabel('Registrar água', 'running', { write: true })).toBe('Registrar água…');
    expect(toolLineLabel('Última série', 'empty')).toBe('Última série · nada encontrado');
    expect(toolLineLabel('Atualizar exercício', 'error')).toBe(
      'Atualizar exercício · não deu certo',
    );
    expect(toolLineLabel('Salvar refeição', 'declined')).toBe('Salvar refeição · você recusou');
    expect(toolLineLabel('Resumo de hoje', 'done', { cardTitle: '934 kcal' })).toBe(
      'Resumo de hoje · 934 kcal',
    );
    expect(toolLineLabel('Registrar água', 'done', { write: true, savedAt: '15:02' })).toBe(
      'Registrar água · gravado às 15:02',
    );
    expect(toolLineLabel('Resumo de hoje', 'done')).toBe('Resumo de hoje');
  });

  it('a última tool é a da última resposta, e nada quando a pessoa falou por último', () => {
    const resposta = {
      role: 'assistant' as const,
      id: 'a',
      text: 'ok',
      reasoning: '',
      tools: [
        { id: '1', name: 'list_meals', status: 'success' as const },
        { id: '2', name: 'get_today_summary', status: 'success' as const },
      ],
    };
    expect(lastToolName([resposta])).toBe('get_today_summary');
    expect(lastToolName([resposta, { role: 'user', id: 'u', text: 'oi', photos: 0 }])).toBeNull();
    expect(lastToolName([])).toBeNull();
  });
});

/** Um app antigo recebe um formato que ainda não conhece: cai no aviso, não quebra a conversa. */
describe('isRenderableChatArtifact', () => {
  it('aceita os formatos conhecidos com o campo de que o desenho depende', () => {
    expect(isRenderableChatArtifact({ kind: 'metric', value: 3 })).toBe(true);
    expect(isRenderableChatArtifact({ kind: 'bars', bars: [] })).toBe(true);
    expect(
      isRenderableChatArtifact({ kind: 'file', url: 'https://x', filename: 'a', expiresAt: '' }),
    ).toBe(true);
  });

  it('recusa formato novo, sem kind ou com o campo principal faltando', () => {
    expect(isRenderableChatArtifact({ kind: 'mapa', pontos: [] })).toBe(false);
    expect(isRenderableChatArtifact({ kind: 'bars' })).toBe(false);
    expect(isRenderableChatArtifact({ kind: 'metric', value: 'x' })).toBe(false);
    expect(isRenderableChatArtifact({ kind: 'badges', badges: 'x' })).toBe(false);
    expect(isRenderableChatArtifact(null)).toBe(false);
    expect(isRenderableChatArtifact('metric')).toBe(false);
  });

  it('título e "vazio" não quebram com a carga que não dá para desenhar', () => {
    const quebrado = { kind: 'bars' } as unknown as ChatArtifact;
    const novo = { kind: 'mapa' } as unknown as ChatArtifact;
    for (const a of [quebrado, novo]) {
      expect(isEmptyChatArtifact(a)).toBe(false);
      expect(chatCardTitle(a)).toBe('Cartão');
    }
  });
});

/** O lote da pausa (#384): a busca conta como decisão, e o aceite só sai no "Enviar". */
describe('lote da pausa com a busca', () => {
  const acoes = [
    { kind: 'confirm', toolCallId: 'c1', tool: 'log_meal', title: 't', prompt: 'p', arguments: {} },
    { kind: 'web_consent', toolCallId: 'w1', tool: 'web_search', prompt: 'p', query: 'q' },
    { kind: 'question', toolCallId: 'q1', prompt: 'p', fields: [] },
  ] as unknown as Parameters<typeof pauseDecisionCount>[0];

  it('conta escritas e buscas, não perguntas', () => {
    expect(pauseDecisionCount(acoes)).toBe(2);
  });

  it('grava o aceite só se a escolha final da busca for concordar e ainda não houver', () => {
    expect(webConsentToSaveOnSend(acoes, { c1: true, w1: true }, false)).toBe(true);
    expect(webConsentToSaveOnSend(acoes, { c1: true, w1: false }, false)).toBe(false);
    expect(webConsentToSaveOnSend(acoes, { c1: true, w1: true }, true)).toBe(false);
    expect(webConsentToSaveOnSend(acoes, { c1: true }, false)).toBe(false);
  });
});

describe('webSearchLineLabel — a linha da busca na web (prancha IA-Estados e Al-M16)', () => {
  it('fala da busca, não da ferramenta', () => {
    expect(webSearchLineLabel('running')).toBe('Pesquisando na web…');
    expect(webSearchLineLabel('done', 3)).toBe('Pesquisei na web · 3 sites');
    expect(webSearchLineLabel('done', 1)).toBe('Pesquisei na web · 1 site');
    expect(webSearchLineLabel('empty')).toBe('Pesquisei na web · nada confiável');
    expect(webSearchLineLabel('error')).toBe('Busca na web indisponível agora');
    expect(webSearchLineLabel('declined')).toBe('Busca na web · você recusou');
    expect(webSearchLineLabel('pending')).toBe('Buscar na web · aguardando sua confirmação');
  });
});

describe('cardEyebrow — o texto pequeno acima do título do cartão', () => {
  it('é o nome da ferramenta, e "Só no app" no cartão do só no app', () => {
    expect(cardEyebrow('get_today_summary', 'Resumo de hoje')).toBe('Resumo de hoje');
    expect(cardEyebrow('app_only', 'Abrir no app')).toBe('Só no app');
  });
});

describe('timelineAxisLabels — as datas embaixo da curva', () => {
  it('primeira, do meio e última, em "6 out"', () => {
    const events = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-04'].map(
      (date, i) => ({ date, value: i }),
    );
    expect(timelineAxisLabels(events)).toEqual(['6 out', '20 out', '4 nov']);
  });
  it('com um ou dois pontos, só os que existem', () => {
    expect(timelineAxisLabels([{ date: '2026-11-04T10:00:00Z' }])).toEqual(['4 nov']);
    expect(timelineAxisLabels([])).toEqual([]);
  });
});

describe('barAxisLabels — os rótulos embaixo das barras', () => {
  const bars = (labels: string[]) => labels.map((label, i) => ({ label, value: i }));
  it('com muitas barras, só início, meio e fim, em "19 out"', () => {
    const dias = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 19 + i));
      return d.toISOString().slice(0, 10);
    });
    expect(barAxisLabels(bars(dias))).toEqual({
      perBar: false,
      labels: ['19 out', '1 nov', '15 nov'],
    });
  });
  it('rótulo já curto passa como está', () => {
    const r = barAxisLabels(bars(Array.from({ length: 10 }, (_, i) => `${i + 1} out`)));
    expect(r).toEqual({ perBar: false, labels: ['1 out', '5 out', '10 out'] });
  });
  it('"20/10" da API sai como "20 out", igual à linha do tempo', () => {
    const r = barAxisLabels(
      bars(Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, '0')}/11`)),
    );
    expect(r).toEqual({ perBar: false, labels: ['1 nov', '5 nov', '10 nov'] });
  });
  it('com poucas barras, um rótulo por barra', () => {
    expect(barAxisLabels(bars(['2026-11-10', '2026-11-11', 'Sem 3']))).toEqual({
      perBar: true,
      labels: ['10 nov', '11 nov', 'Sem 3'],
    });
    expect(barAxisLabels([])).toEqual({ perBar: true, labels: [] });
  });
});

describe('timelinePeriodLabel — o período da variação', () => {
  it('conta os dias entre o primeiro e o último ponto', () => {
    const e = (date: string) => ({ date, value: 1 });
    expect(timelinePeriodLabel([e('2026-10-06'), e('2026-11-05')])).toBe('em 30 dias');
    expect(timelinePeriodLabel([e('2026-11-04'), e('2026-11-05')])).toBe('em 1 dia');
    expect(timelinePeriodLabel([e('2026-11-05')])).toBe('no período');
  });
});

describe('chatArtifactAsksAction — o cartão que fica aberto com as tools recolhidas (#487)', () => {
  const t = 'c1';
  it('o registro gravado, o "abrir no app" e o arquivo pedem um toque da pessoa', () => {
    expect(
      chatArtifactAsksAction({ toolCallId: t, kind: 'saved', at: '', lines: [], undoable: true }),
    ).toBe(true);
    expect(
      chatArtifactAsksAction({ toolCallId: t, kind: 'app_only', tool: 'delete_meal', params: {} }),
    ).toBe(true);
    expect(
      chatArtifactAsksAction({
        toolCallId: t,
        kind: 'file',
        url: 'u',
        filename: 'f',
        expiresAt: '',
      }),
    ).toBe(true);
  });
  it('a consulta é detalhe: recolhe numa linha', () => {
    expect(chatArtifactAsksAction({ toolCallId: t, kind: 'metric', value: 3 })).toBe(false);
    expect(chatArtifactAsksAction({ toolCallId: t, kind: 'timeline', events: [] })).toBe(false);
    expect(chatArtifactAsksAction({ toolCallId: t, kind: 'sources', sources: [] })).toBe(false);
  });
});
