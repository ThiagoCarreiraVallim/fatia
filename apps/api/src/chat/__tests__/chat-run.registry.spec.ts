import { ConflictException } from '@nestjs/common';
import { ChatRun, ChatRunRegistry, RUN_BUFFER_BYTES, createSseFramer } from '../chat-run.registry';

/** O registro das respostas em andamento (ADR 035), sem socket nem agente. */

const CONVERSA = 'c-1';

function coletor() {
  const recebidos: string[] = [];
  let terminou = false;
  return {
    sink: { write: (t: string) => recebidos.push(t), end: () => (terminou = true) },
    recebidos,
    terminou: () => terminou,
  };
}

describe('createSseFramer', () => {
  it('só entrega evento completo, mesmo cortado no meio de um caractere', () => {
    const framer = createSseFramer();
    const bytes = new TextEncoder().encode('event: messages\ndata: {"t":"ação"}\n\n');
    const corte = bytes.indexOf(0xc3) + 1; // no meio do "ç"

    expect(framer.push(bytes.slice(0, corte))).toEqual([]);
    expect(framer.push(bytes.slice(corte))).toEqual(['event: messages\ndata: {"t":"ação"}\n\n']);
  });

  it('separa vários eventos num pedaço só e normaliza CRLF', () => {
    const framer = createSseFramer();
    expect(framer.push('event: a\r\ndata: 1\r\n\r\nevent: b\ndata: 2\n\n')).toEqual([
      'event: a\ndata: 1\n\n',
      'event: b\ndata: 2\n\n',
    ]);
  });
});

describe('ChatRun', () => {
  it('numera os eventos e reenvia só o que veio depois do cursor', () => {
    const run = new ChatRun('u', CONVERSA);
    run.publish('event: a\ndata: 1\n\n');
    run.publish('event: b\ndata: 2\n\n');
    run.publish('event: c\ndata: 3\n\n');

    const { sink, recebidos } = coletor();
    run.subscribe(1, sink);

    expect(recebidos).toEqual(['id: 2\nevent: b\ndata: 2\n\n', 'id: 3\nevent: c\ndata: 3\n\n']);
  });

  it('comentário SSE passa sem número', () => {
    const run = new ChatRun('u', CONVERSA);
    const { sink, recebidos } = coletor();
    run.subscribe(0, sink);
    run.publish(': aberto\n\n');
    expect(recebidos).toEqual([': aberto\n\n']);
  });

  it('quem assina depois do fim recebe o resto e o fim, na hora', () => {
    const run = new ChatRun('u', CONVERSA);
    run.publish('event: a\ndata: 1\n\n');
    run.finish();

    const { sink, recebidos, terminou } = coletor();
    run.subscribe(0, sink);

    expect(recebidos).toHaveLength(1);
    expect(terminou()).toBe(true);
  });

  it('sair da assinatura não para o turno, e não recebe mais nada', () => {
    const run = new ChatRun('u', CONVERSA);
    let cortado = false;
    run.bindUpstream(() => (cortado = true));
    const { sink, recebidos } = coletor();
    const sair = run.subscribe(0, sink);

    sair();
    run.publish('event: a\ndata: 1\n\n');

    expect(recebidos).toEqual([]);
    expect(cortado).toBe(false);
  });

  it('parar antes de o upstream existir corta assim que ele é ligado', () => {
    const run = new ChatRun('u', CONVERSA);
    run.stop();
    let cortado = false;
    run.bindUpstream(() => (cortado = true));
    expect(cortado).toBe(true);
    expect(run.stopRequested).toBe(true);
  });

  it('acima do teto de memória, os eventos mais antigos saem do reenvio', () => {
    const run = new ChatRun('u', CONVERSA);
    const grande = `event: m\ndata: ${'x'.repeat(1024 * 1024)}\n\n`;
    for (let i = 0; i < 10; i++) run.publish(grande);

    const { sink, recebidos } = coletor();
    run.subscribe(0, sink);

    expect(recebidos.join('').length).toBeLessThanOrEqual(RUN_BUFFER_BYTES);
    expect(recebidos[0]).not.toMatch(/^id: 1\n/);
    expect(recebidos.at(-1)).toMatch(/^id: 10\n/);
  });
});

describe('ChatRunRegistry', () => {
  let registry: ChatRunRegistry;
  beforeEach(() => (registry = new ChatRunRegistry()));
  afterEach(() => registry.onModuleDestroy());

  it('o turno de uma conversa só aparece para a dona dela', () => {
    registry.start('dona', CONVERSA);
    expect(registry.find('dona', CONVERSA)).not.toBeNull();
    expect(registry.find('outra', CONVERSA)).toBeNull();
    expect(registry.isRunning('outra', CONVERSA)).toBe(false);
  });

  it('dois turnos na mesma conversa: o segundo é 409 enquanto o primeiro corre', () => {
    const run = registry.start('dona', CONVERSA);
    expect(() => registry.start('dona', CONVERSA)).toThrow(ConflictException);
    registry.finish(run);
    expect(() => registry.start('dona', CONVERSA)).not.toThrow();
  });

  it('terminado continua achável por um minuto, e depois some', () => {
    jest.useFakeTimers();
    try {
      const run = registry.start('dona', CONVERSA);
      registry.finish(run);
      expect(registry.find('dona', CONVERSA)).toBe(run);
      expect(registry.isRunning('dona', CONVERSA)).toBe(false);
      jest.advanceTimersByTime(60_001);
      expect(registry.find('dona', CONVERSA)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('manda sinal de vida a quem assina enquanto o agente pensa', () => {
    jest.useFakeTimers();
    try {
      const run = registry.start('dona', CONVERSA);
      const { sink, recebidos } = coletor();
      run.subscribe(0, sink);
      jest.advanceTimersByTime(15_001);
      expect(recebidos).toEqual([': ping\n\n']);
      registry.finish(run);
    } finally {
      jest.useRealTimers();
    }
  });
});
