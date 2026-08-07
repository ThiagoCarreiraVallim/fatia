import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatRequest, ChatStreamEvent, StreamChatInit } from '@fatia/api-client';

/**
 * A tela de chat (#250).
 *
 * O que este arquivo cobra é o que a issue chama de produto: **token a token**
 * (e não a resposta inteira aparecendo no fim), **qual tool foi chamada**, e
 * **erro que não trava a conversa**. Mais foco e anúncio, que num chat não são
 * enfeite — a #221 nasceu de foco perdido para o `<body>`.
 *
 * O streaming é dirigido à mão por `Fonte`: se o teste apenas despejasse todos os
 * eventos e olhasse o fim, ele passaria igual com uma implementação que só
 * renderiza quando o stream fecha — exatamente o defeito que a épica proíbe.
 */

/**
 * Gerador dirigido pelo teste: nada aparece até o caso mandar aparecer.
 *
 * Ele **obedece ao `signal`** porque o `streamChat` real obedece: abortado, o
 * generator só retorna, sem lançar e sem emitir erro. Um dublê que ignorasse o
 * sinal deixaria o caminho de "parar a resposta" verde sem nunca ser executado —
 * a armadilha do dublê com forma que a realidade não tem.
 */
class Fonte {
  private eventos: ChatStreamEvent[] = [];
  private aguardando: (() => void) | null = null;
  private terminou = false;

  async *gerar(signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    let i = 0;
    for (;;) {
      if (signal?.aborted) return;
      if (i < this.eventos.length) {
        yield this.eventos[i];
        i += 1;
        continue;
      }
      if (this.terminou) return;
      await new Promise<void>((resolve) => {
        this.aguardando = resolve;
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    }
  }

  emitir(evento: ChatStreamEvent): void {
    this.eventos.push(evento);
    this.aguardando?.();
    this.aguardando = null;
  }

  fechar(): void {
    this.terminou = true;
    this.aguardando?.();
    this.aguardando = null;
  }
}

let fontes: Fonte[] = [];
// Os parâmetros são anotados com os tipos do cliente: se o corpo que a tela
// manda deixar de bater com o contrato, o erro aparece no `tsc` (lição da #157).
const streamChatMock = vi.fn((_corpo: ChatRequest, _init?: StreamChatInit) => {
  const fonte = new Fonte();
  fontes.push(fonte);
  return fonte.gerar(_init?.signal);
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  // `textoDeErroDoChat` entra **real**: a cópia por código é parte do requisito,
  // e dublá-la faria o caso conversar consigo mesmo.
  return { ...actual, streamChat: streamChatMock };
});

const { ChatView } = await import('../chat-view');

beforeAll(() => {
  // `use-stick-to-bottom`, que o `Conversation` do registry usa, observa o
  // tamanho do container. O jsdom não tem ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  fontes = [];
});

async function enviar(texto: string) {
  const user = userEvent.setup();
  const campo = screen.getByRole('textbox', { name: 'Mensagem para o Fatia' });
  await user.type(campo, texto);
  await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
  return { user, campo };
}

describe('ChatView', () => {
  it('renderiza a resposta token a token, e não só no fim', async () => {
    render(<ChatView />);
    await enviar('bom dia');

    fontes[0].emitir({ type: 'token', text: 'Bom ' });
    // Correspondência exata: `toHaveTextContent`/substring passaria com o texto
    // final já inteiro na tela, que é o defeito que este caso existe para pegar.
    expect(await screen.findByText('Bom')).toBeInTheDocument();
    expect(screen.queryByText('Bom dia!')).not.toBeInTheDocument();

    fontes[0].emitir({ type: 'token', text: 'dia!' });
    expect(await screen.findByText('Bom dia!')).toBeInTheDocument();
  });

  it('mostra "Pensando" enquanto nada chegou, e some no primeiro token', async () => {
    // É o único retorno visual entre apertar enviar e o primeiro token. Sem
    // caso próprio ele podia sumir num refactor sem nada acusar.
    render(<ChatView />);
    await enviar('bom dia');

    expect(await screen.findByLabelText('Pensando')).toBeInTheDocument();

    fontes[0].emitir({ type: 'token', text: 'Bom' });
    await screen.findByText('Bom');
    expect(screen.queryByLabelText('Pensando')).not.toBeInTheDocument();
  });

  it('o "Pensando" fica no balão que está sendo reescrito, não no último', async () => {
    // `aguardando={m.id === respondendoId}` é por id, e não por posição: refazer
    // um turno do meio deixa o "pensando" onde a resposta está sendo reescrita.
    render(<ChatView />);
    await enviar('quanto comi hoje?');
    fontes[0].emitir({ type: 'error', error: { code: 'AI_PROVIDER_UNREACHABLE' } });
    fontes[0].fechar();
    await screen.findByRole('alert');

    await enviar('e o treino?');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    fontes[1].emitir({ type: 'token', text: 'Foi peito.' });
    fontes[1].fechar();
    const resposta = await screen.findByText('Foi peito.');

    const user = userEvent.setup();
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: /Tentar/ }));

    const pensando = await screen.findByLabelText('Pensando');
    // Ordem no documento: o "pensando" está **antes** da resposta boa do turno
    // seguinte, ou seja, no balão do turno refeito.
    expect(pensando.compareDocumentPosition(resposta) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('mostra qual tool foi chamada, e o resultado quando ele chega', async () => {
    render(<ChatView />);
    await enviar('registra 2 ovos');

    fontes[0].emitir({
      type: 'tool',
      tool: { id: 'c1', name: 'registrar_refeicao', state: 'input-available', input: { g: 100 } },
    });
    expect(await screen.findByText('registrar_refeicao')).toBeInTheDocument();
    expect(screen.getByText('Executando')).toBeInTheDocument();

    fontes[0].emitir({
      type: 'tool',
      tool: {
        id: 'c1',
        name: 'registrar_refeicao',
        state: 'output-available',
        output: { mealId: 'm1' },
      },
    });
    expect(await screen.findByText('Concluída')).toBeInTheDocument();
    // O mesmo `id` atualiza o bloco; não abre um segundo.
    expect(screen.getAllByText('registrar_refeicao')).toHaveLength(1);
    expect(screen.queryByText('Executando')).not.toBeInTheDocument();
  });

  it.each([
    ['AI_PROVIDER_NOT_CONFIGURED', /não está configurado nesta instância/],
    ['AI_QUOTA_EXCEEDED', /limite diário de uso da IA/],
    ['AI_NETWORK_ERROR', /A conexão caiu no meio da resposta/],
  ] as const)('%s aparece com mensagem própria', async (code, esperado) => {
    render(<ChatView />);
    await enviar('oi');

    fontes[0].emitir({ type: 'error', error: { code } });
    fontes[0].fechar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(esperado);
  });

  it('depois do erro a conversa continua utilizável', async () => {
    render(<ChatView />);
    await enviar('oi');

    fontes[0].emitir({ type: 'token', text: 'come' });
    fontes[0].emitir({ type: 'error', error: { code: 'AI_NETWORK_ERROR' } });
    fontes[0].fechar();
    await screen.findByRole('alert');

    // O que já tinha chegado não some — é o que a mensagem de erro promete.
    expect(screen.getByText('come')).toBeInTheDocument();

    await enviar('de novo');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    expect(streamChatMock.mock.calls[1][0]).toMatchObject({ message: 'de novo' });

    fontes[1].emitir({ type: 'token', text: 'Agora vai.' });
    fontes[1].fechar();
    expect(await screen.findByText('Agora vai.')).toBeInTheDocument();
    // O turno que falhou continua marcado no histórico — mas só ele. A nova
    // resposta não herda o erro da anterior.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('o botão de tentar de novo repete a pergunta sem duplicá-la na tela', async () => {
    render(<ChatView />);
    await enviar('quanto comi hoje?');

    fontes[0].emitir({ type: 'error', error: { code: 'AI_PROVIDER_UNREACHABLE' } });
    fontes[0].fechar();
    const alerta = await screen.findByRole('alert');

    const user = userEvent.setup();
    await user.click(within(alerta).getByRole('button', { name: /Tentar de novo/ }));

    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    expect(streamChatMock.mock.calls[1][0]).toMatchObject({ message: 'quanto comi hoje?' });
    expect(screen.getAllByText('quanto comi hoje?')).toHaveLength(1);
  });

  it('tentar de novo num erro antigo repete aquela pergunta, e não a última', async () => {
    // O botão de "Tentar de novo" continua na tela do turno que falhou mesmo
    // depois de a conversa seguir. Se o retry olhar sempre a **última** pergunta
    // e cortar as duas últimas mensagens, clicar no aviso antigo reenvia a
    // pergunta errada e ainda apaga a resposta boa que veio depois.
    render(<ChatView />);
    await enviar('quanto comi hoje?');
    fontes[0].emitir({ type: 'error', error: { code: 'AI_PROVIDER_UNREACHABLE' } });
    fontes[0].fechar();
    await screen.findByRole('alert');

    await enviar('e o treino?');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    fontes[1].emitir({ type: 'token', text: 'Foi peito.' });
    fontes[1].fechar();
    await screen.findByText('Foi peito.');

    const user = userEvent.setup();
    const alerta = screen.getByRole('alert');
    await user.click(within(alerta).getByRole('button', { name: /Tentar de novo/ }));

    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(3));
    expect(streamChatMock.mock.calls[2][0]).toMatchObject({ message: 'quanto comi hoje?' });
    // A resposta boa do turno seguinte continua na conversa.
    expect(screen.getByText('Foi peito.')).toBeInTheDocument();
    expect(screen.getByText('e o treino?')).toBeInTheDocument();
  });

  it('tentar de novo enquanto outra resposta corre não apaga o aviso à toa', async () => {
    // Dois streams ao mesmo tempo brigariam pela mesma lista, então o segundo é
    // recusado. Recusar depois de já ter limpado o aviso deixaria o turno com o
    // balão vazio e sem botão: o erro sumiria da tela sem nada ter acontecido.
    render(<ChatView />);
    await enviar('quanto comi hoje?');
    fontes[0].emitir({ type: 'error', error: { code: 'AI_PROVIDER_UNREACHABLE' } });
    fontes[0].fechar();
    const alerta = await screen.findByRole('alert');

    await enviar('e o treino?');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    fontes[1].emitir({ type: 'token', text: 'Foi ' });
    await screen.findByText('Foi');

    const user = userEvent.setup();
    await user.click(within(alerta).getByRole('button', { name: /Tentar de novo/ }));

    expect(streamChatMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('parar a resposta não anuncia que o Fatia respondeu', async () => {
    const { container } = render(<ChatView />);
    await enviar('me conta tudo');
    const regiao = container.querySelector('[aria-live="polite"]');

    fontes[0].emitir({ type: 'token', text: 'Vou come' });
    await screen.findByText('Vou come');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Parar resposta' }));

    // Quem interrompeu não recebeu resposta; anunciar "Fatia respondeu" manda
    // quem usa leitor de tela procurar no fim da conversa um texto truncado.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeTruthy(),
    );
    expect(regiao?.textContent).not.toContain('Fatia respondeu');
    expect(regiao?.textContent).toContain('interrompida');
    // O que já tinha chegado fica: parar não apaga a resposta parcial.
    expect(screen.getByText('Vou come')).toBeInTheDocument();
  });

  it('mantém o foco no campo depois de enviar', async () => {
    render(<ChatView />);
    const { campo } = await enviar('oi');
    // A #221: perder o foco para o `<body>` a cada envio obriga quem usa teclado
    // ou leitor de tela a reencontrar o campo antes de cada mensagem.
    expect(campo).toHaveFocus();
    expect(campo).toHaveValue('');
  });

  it('anuncia a resposta uma vez, no fim, citando a tool usada', async () => {
    const { container } = render(<ChatView />);
    await enviar('registra 2 ovos');

    const regiao = container.querySelector('[aria-live="polite"]');
    expect(regiao).not.toBeNull();

    fontes[0].emitir({ type: 'token', text: 'Registrei.' });
    await screen.findByText('Registrei.');
    // Nada de anúncio durante o streaming: token a token viraria ruído.
    expect(regiao).toHaveTextContent('');

    fontes[0].emitir({
      type: 'tool',
      tool: { id: 'c1', name: 'registrar_refeicao', state: 'output-available' },
    });
    fontes[0].fechar();

    await waitFor(() => expect(regiao?.textContent ?? '').toContain('registrar_refeicao'));
    expect(regiao?.textContent).toContain('Fatia respondeu');
  });

  it('a região viva do log fica calada — quem anuncia é a região de status', async () => {
    render(<ChatView />);
    // `role="log"` vem do `Conversation` do registry e anuncia sozinho cada
    // mudança; com streaming isso é um anúncio por token.
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'off');
  });

  it('continua a mesma conversa na segunda pergunta', async () => {
    render(<ChatView />);
    await enviar('oi');
    fontes[0].emitir({ type: 'conversation', conversationId: 'conv-7' });
    fontes[0].emitir({ type: 'token', text: 'Oi!' });
    fontes[0].fechar();
    await screen.findByText('Oi!');

    await enviar('e agora?');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    expect(streamChatMock.mock.calls[1][0]).toEqual({
      message: 'e agora?',
      conversationId: 'conv-7',
    });
  });
});
