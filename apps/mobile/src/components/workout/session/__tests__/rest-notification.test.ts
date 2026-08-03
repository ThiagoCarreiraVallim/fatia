import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRestNotifications,
  isRestNotification,
  REST_NOTIFICATION_KIND,
  restDelaySeconds,
  restWasInterrupted,
  type RestNotifier,
} from '../rest-notification';

/**
 * O que dá para provar sem aparelho.
 *
 * A entrega da notificação com a tela apagada não é verificável em CI — nem o
 * som, nem o canal do Android, nem o diálogo de permissão. O que **é**
 * verificável, e é onde mora o defeito caro, é a contabilidade em volta: o
 * instante calculado, o cancelamento ao pular o descanso e o agendamento que
 * volta atrasado depois de a pessoa já ter pulado. Um aviso que toca depois que
 * a série seguinte começou é pior do que aviso nenhum.
 */

function fakeNotifier(overrides: Partial<RestNotifier> = {}) {
  let proximo = 0;
  return {
    ensurePermission: vi.fn(async () => true),
    schedule: vi.fn(async () => `notif-${++proximo}`),
    cancel: vi.fn(async () => {}),
    ...overrides,
  } satisfies RestNotifier;
}

/**
 * Um `ensurePermission` que fica em voo até alguém responder — o diálogo do
 * sistema, que no primeiro descanso fica na tela o tempo que a pessoa levar
 * para ler. `perguntada` resolve quando o diálogo "abriu", para o teste mexer
 * no relógio sem depender de `waitFor` (que, com timers falsos, adianta o
 * relógio junto e embaralharia justamente o que está sendo medido).
 */
function notifierComDialogoAberto() {
  let responder!: (permitiu: boolean) => void;
  let abriu!: () => void;
  const perguntada = new Promise<void>((resolve) => (abriu = resolve));
  const notifier = fakeNotifier({
    ensurePermission: vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          responder = resolve;
          abriu();
        }),
    ),
  });
  return { notifier, perguntada, responder: (permitiu: boolean) => responder(permitiu) };
}

describe('restDelaySeconds', () => {
  const agora = 1_700_000_000_000;

  it('conta os segundos que faltam até o fim do descanso', () => {
    expect(restDelaySeconds(agora + 90_000, agora)).toBe(90);
  });

  it('arredonda para cima', () => {
    // Meio segundo a mais atrasa o aviso em meio segundo; meio segundo a menos
    // toca com a pessoa ainda descansando, e o timer na tela ainda marcando 1.
    expect(restDelaySeconds(agora + 89_400, agora)).toBe(90);
  });

  it('recusa descanso que já acabou', () => {
    expect(restDelaySeconds(agora, agora)).toBeNull();
    expect(restDelaySeconds(agora - 5_000, agora)).toBeNull();
  });

  it('respeita o piso de um segundo do gatilho', () => {
    // `scheduleNotificationAsync` não aceita gatilho abaixo de um segundo.
    expect(restDelaySeconds(agora + 400, agora)).toBe(1);
  });
});

describe('isRestNotification', () => {
  it('reconhece o aviso do fim do descanso', () => {
    expect(isRestNotification({ kind: REST_NOTIFICATION_KIND })).toBe(true);
  });

  it('não responde pelo que não é do descanso', () => {
    // O handler do Expo é global do app: se ele silenciar em bloco, o push
    // remoto da #148 chega mudo e sem tarja, e nada aponta para o arquivo de
    // sessão de treino que decidiu isso.
    expect(isRestNotification({ kind: 'novo-comentario-do-treinador' })).toBe(false);
    expect(isRestNotification({})).toBe(false);
    expect(isRestNotification(undefined)).toBe(false);
    expect(isRestNotification(null)).toBe(false);
  });
});

describe('restWasInterrupted', () => {
  const agora = 1_700_000_000_000;

  it('reconhece pulo, pausa e saída no meio do descanso', () => {
    expect(restWasInterrupted(agora + 30_000, agora)).toBe(true);
  });

  it('não trata o fim do descanso como interrupção', () => {
    // O tique que zera o cronômetro limpa o `deadline` como se fosse um pulo.
    // Cancelar aí mataria a notificação a caminho — e no Android, com o app em
    // segundo plano, o tique roda: a feature morreria exatamente no caso que
    // ela existe para atender.
    expect(restWasInterrupted(agora, agora)).toBe(false);
    expect(restWasInterrupted(agora - 500, agora)).toBe(false);
  });
});

describe('createRestNotifications', () => {
  const agora = 1_700_000_000_000;

  // O relógio é o objeto do teste, não um detalhe: o atraso do gatilho conta a
  // partir da chamada de `schedule`, então o que passa entre o início do
  // descanso e ela precisa ser mensurável aqui.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(agora);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agenda para o instante em que o descanso termina', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    await rest.schedule(agora + 90_000);

    expect(notifier.schedule).toHaveBeenCalledTimes(1);
    expect(notifier.schedule).toHaveBeenCalledWith(90);
  });

  it('desconta o tempo que o diálogo de permissão ficou na tela', async () => {
    const { notifier, perguntada, responder } = notifierComDialogoAberto();
    const rest = createRestNotifications(notifier);

    const emVoo = rest.schedule(agora + 90_000);
    await perguntada;
    // Primeiro descanso depois de instalar: o diálogo do sistema fica 20s na
    // tela até a pessoa tocar em "Permitir".
    vi.setSystemTime(agora + 20_000);
    responder(true);
    await emVoo;

    // Pedir 90 aqui entregaria o aviso aos 110s — 20s depois do fim do
    // descanso, provavelmente no meio da série seguinte. E nada o cancelaria:
    // quando o descanso acaba sozinho, `restWasInterrupted` é `false`.
    expect(notifier.schedule).toHaveBeenCalledWith(70);
  });

  it('desiste do aviso quando o descanso vence com o diálogo aberto', async () => {
    const { notifier, perguntada, responder } = notifierComDialogoAberto();
    const rest = createRestNotifications(notifier);

    const emVoo = rest.schedule(agora + 90_000);
    await perguntada;
    // Largou o celular e voltou três minutos depois: o descanso já acabou.
    vi.setSystemTime(agora + 180_000);
    responder(true);
    await emVoo;

    expect(notifier.schedule).not.toHaveBeenCalled();
  });

  it('cancela o agendamento anterior ao somar 30s', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    await rest.schedule(agora + 90_000);
    await rest.schedule(agora + 120_000);

    // Sem cancelar, o `+30s` deixaria dois avisos na fila e o primeiro tocaria
    // no meio do descanso esticado.
    expect(notifier.cancel).toHaveBeenCalledWith('notif-1');
    expect(notifier.schedule).toHaveBeenLastCalledWith(120);
  });

  it('cancela ao pular o descanso', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    await rest.schedule(agora + 90_000);
    await rest.cancel();

    expect(notifier.cancel).toHaveBeenCalledWith('notif-1');
  });

  it('não cancela nada quando não há descanso em curso', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    await rest.cancel();
    await rest.cancel();

    expect(notifier.cancel).not.toHaveBeenCalled();
  });

  it('cancela o agendamento que só volta depois do pulo', async () => {
    // O agendamento é assíncrono e o botão "pular" é síncrono: quem pula
    // enquanto o `schedule` está em voo guardaria um id que ninguém cancela, e
    // a notificação tocaria com a pessoa já na próxima série.
    let liberar!: (id: string) => void;
    const notifier = fakeNotifier({
      schedule: vi.fn(() => new Promise<string>((resolve) => (liberar = resolve))),
    });
    const rest = createRestNotifications(notifier);

    const emVoo = rest.schedule(agora + 90_000);
    // Espera o agendamento sair de fato: a permissão é perguntada antes dele, e
    // pular nesse intervalo é outro cenário (aí não há id nenhum para vazar).
    await vi.waitFor(() => expect(notifier.schedule).toHaveBeenCalled());
    await rest.cancel();
    liberar('notif-atrasada');
    await emVoo;

    expect(notifier.cancel).toHaveBeenCalledWith('notif-atrasada');
  });

  it('degrada em silêncio quando a permissão é negada', async () => {
    const notifier = fakeNotifier({ ensurePermission: vi.fn(async () => false) });
    const rest = createRestNotifications(notifier);

    // Não estoura: o timer na tela é quem manda, a notificação é o extra.
    await expect(rest.schedule(agora + 90_000)).resolves.toBeUndefined();
    expect(notifier.schedule).not.toHaveBeenCalled();
  });

  it('não deixa o erro do módulo nativo derrubar o descanso', async () => {
    const notifier = fakeNotifier({
      ensurePermission: vi
        .fn<() => Promise<boolean>>()
        .mockRejectedValueOnce(new Error('sem módulo nativo'))
        .mockResolvedValue(true),
    });
    const rest = createRestNotifications(notifier);

    // Quem chama é um `useEffect`: rejeição aqui vira erro não tratado, tela
    // vermelha no development build, por causa de um aviso que é o extra.
    await expect(rest.schedule(agora + 90_000)).resolves.toBeUndefined();

    // E a falha não fica guardada: o descanso seguinte pergunta de novo, em vez
    // de carregar para sempre a resposta que nunca chegou.
    await rest.schedule(agora + 90_000);
    expect(notifier.ensurePermission).toHaveBeenCalledTimes(2);
    expect(notifier.schedule).toHaveBeenCalledTimes(1);
  });

  it('pergunta a permissão uma vez só, no primeiro descanso', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    // Nada de perguntar na abertura do app: o construtor não fala com o
    // sistema. Permissão pedida sem contexto é permissão negada.
    expect(notifier.ensurePermission).not.toHaveBeenCalled();

    await rest.schedule(agora + 90_000);
    await rest.cancel();
    await rest.schedule(agora + 60_000);

    // Entre uma série e outra, um diálogo do sistema a cada descanso é o
    // caminho mais curto para o app ser desinstalado.
    expect(notifier.ensurePermission).toHaveBeenCalledTimes(1);
  });

  it('não pergunta a permissão por um descanso que nem dá para agendar', async () => {
    const notifier = fakeNotifier();
    const rest = createRestNotifications(notifier);

    await rest.schedule(agora - 1_000);

    expect(notifier.ensurePermission).not.toHaveBeenCalled();
    expect(notifier.schedule).not.toHaveBeenCalled();
  });
});
