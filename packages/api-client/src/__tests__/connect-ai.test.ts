import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_OPTIONS,
  connectedFootnote,
  connectedTitle,
  connectionFor,
  connectSteps,
  failureChecks,
  initialProvider,
  lastAccessLabel,
  providerOfClient,
  type McpConnection,
} from '../connect-ai';
import { CONNECT_AI_TUTORIAL_ID, tutorialById } from '../tutorials';

const conn = (clientName: string | null, lastUsedAt: string, id = clientName ?? 'x') =>
  ({ id, clientName, connectedAt: lastUsedAt, lastUsedAt }) as McpConnection;

describe('Conectar sua IA (#388, pranchas Al-V6..V6e)', () => {
  it('o seletor tem Claude, ChatGPT e Outro app, nessa ordem', () => {
    expect(AI_PROVIDER_OPTIONS.map((o) => o.label)).toEqual(['Claude', 'ChatGPT', 'Outro app']);
  });

  it('cada IA tem quatro passos, com as palavras da tela dela', () => {
    expect(connectSteps('claude', null).map((s) => s.title)).toEqual([
      'Abra Settings → Connectors',
      'Add custom connector',
      'Cole o endereço',
      'Entre e autorize',
    ]);
    expect(connectSteps('chatgpt', null).map((s) => s.title)).toEqual([
      'Abra Configurações → Apps e conectores',
      'Ative o modo desenvolvedor',
      'Crie um conector',
      'Entre e autorize',
    ]);
    expect(connectSteps('other', null)[1]!.title).toBe('Adicione um servidor remoto');
  });

  it('o passo de autorizar mostra o e-mail da conta atual', () => {
    expect(connectSteps('chatgpt', 'ana@email.com')[3]!.detail).toBe(
      'Com o mesmo e-mail desta conta: ana@email.com.',
    );
    expect(connectSteps('claude', null)[3]!.detail).toBe('Com o mesmo e-mail desta conta.');
  });

  describe('qual app é qual', () => {
    it.each([
      ['Claude', 'claude'],
      ['claude.ai', 'claude'],
      ['Claude Desktop', 'claude'],
      ['ChatGPT', 'chatgpt'],
      ['OpenAI ChatGPT Connector', 'chatgpt'],
      ['Cursor', 'other'],
      [null, 'other'],
    ] as const)('%s → %s', (name, provider) => {
      expect(providerOfClient(name)).toBe(provider);
    });

    it('a conexão de cada IA é a mais recente dela; a de outra IA não conta', () => {
      const list = [
        conn('Claude', '2026-11-16T10:00:00Z', 'velha'),
        conn('ChatGPT', '2026-11-16T11:00:00Z'),
        conn('Claude', '2026-11-16T12:00:00Z', 'nova'),
      ];
      expect(connectionFor('claude', list)?.id).toBe('nova');
      expect(connectionFor('chatgpt', list)?.clientName).toBe('ChatGPT');
      expect(connectionFor('other', list)).toBeNull();
    });

    it('a tela abre na IA da conexão mais recente; sem nenhuma, no Claude', () => {
      expect(initialProvider([])).toBe('claude');
      expect(
        initialProvider([
          conn('Claude', '2026-11-01T00:00:00Z'),
          conn('ChatGPT', '2026-11-16T00:00:00Z'),
        ]),
      ).toBe('chatgpt');
    });
  });

  describe('último acesso', () => {
    const now = new Date('2026-11-16T15:00:00-03:00');
    it.each([
      ['2026-11-16T14:59:30-03:00', 'agora'],
      ['2026-11-16T14:40:00-03:00', 'há 20 min'],
      ['2026-11-16T12:00:00-03:00', 'há 3 h'],
      ['2026-11-15T09:00:00-03:00', 'ontem'],
      ['2026-11-12T09:00:00-03:00', 'há 4 dias'],
      ['2026-10-02T09:00:00-03:00', 'em 02/10'],
    ])('%s → %s', (iso, label) => {
      expect(lastAccessLabel(iso, now)).toBe(label);
    });

    it('relógio adiantado no servidor não vira "há -1 min"', () => {
      expect(lastAccessLabel('2026-11-16T15:01:00-03:00', now)).toBe('agora');
    });
  });

  it('conectado: título pela IA e rodapé sem prometer desconectar pelo Fatia', () => {
    expect(connectedTitle('chatgpt', conn('ChatGPT', 'x'))).toBe('Conectado ao ChatGPT');
    expect(connectedTitle('claude', conn('claude.ai', 'x'))).toBe('Conectado ao Claude');
    expect(connectedTitle('other', conn('Cursor', 'x'))).toBe('Cursor conectado');
    expect(connectedTitle('other', conn(null, 'x'))).toBe('App conectado');

    const footnote = connectedFootnote(new Date().toISOString(), new Date());
    expect(footnote).toBe(
      'Último acesso agora · para desconectar, remova o conector no app da sua IA.',
    );
    expect(footnote).not.toMatch(/Configurações da IA/);
  });

  it('não funcionou: o link inteiro, o e-mail certo e a dica da IA escolhida', () => {
    const url = 'https://api.exemplo.test/mcp';
    expect(failureChecks('chatgpt', url, 'ana@email.com')).toEqual([
      `Confira se o link está inteiro: ${url}`,
      'Entre com o mesmo e-mail desta conta: ana@email.com',
      'No ChatGPT, ative o conector na conversa antes de perguntar',
    ]);
    expect(failureChecks('claude', url, null)[1]).toBe('Entre com o mesmo e-mail desta conta');
    expect(failureChecks('claude', url, null)[2]).toMatch(/^No Claude/);
  });

  it('"Ver o tutorial" abre um tutorial que existe na Ajuda', () => {
    expect(tutorialById(CONNECT_AI_TUTORIAL_ID)?.title).toMatch(/Conectar/);
    expect(tutorialById('nao-existe')).toBeNull();
  });
});
