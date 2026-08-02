/**
 * A contabilidade da notificação local de fim de descanso (#182), sem tocar em
 * `expo-notifications`.
 *
 * Mora separada do adaptador por dois motivos. O primeiro é o de sempre nesta
 * pasta: o harness do app roda em Node e não monta módulo nativo, então tudo o
 * que ficar junto do `import * as Notifications` só é verificável em aparelho.
 * O segundo é que o defeito caro daqui não é a notificação em si — é a
 * contabilidade em volta dela: agendar duas, ou não cancelar a que já não vale.
 * Um aviso que toca com a pessoa já na próxima série é pior do que aviso
 * nenhum, e ninguém liga o defeito ao botão "pular" que apertou dois minutos
 * antes.
 */

/** Canal do Android. Sem canal, o sistema entrega em silêncio e sem vibrar. */
export const REST_CHANNEL_ID = 'workout-rest';

/** O que o adaptador precisa saber fazer. Nada aqui conhece o Expo. */
export interface RestNotifier {
  /** `true` se dá para notificar. Pergunta ao sistema; não agenda nada. */
  ensurePermission(): Promise<boolean>;
  /** Agenda para daqui a `seconds` e devolve o id do agendamento. */
  schedule(seconds: number): Promise<string>;
  cancel(id: string): Promise<void>;
}

export interface RestNotifications {
  /** Agenda o aviso do fim do descanso, cancelando o anterior. */
  schedule(deadline: number, now?: number): Promise<void>;
  /** Pular, pausar ou sair da sessão. */
  cancel(): Promise<void>;
}

/**
 * Segundos até o fim do descanso, ou `null` quando não vale agendar.
 *
 * Arredonda para cima, como o relógio da tela: meio segundo a mais atrasa o
 * aviso em meio segundo, meio segundo a menos toca com o timer ainda marcando
 * 1. E `scheduleNotificationAsync` não aceita gatilho abaixo de um segundo.
 */
export function restDelaySeconds(deadline: number, now: number): number | null {
  const seconds = Math.ceil((deadline - now) / 1000);
  return seconds >= 1 ? seconds : null;
}

/**
 * O descanso acabou antes da hora, ou chegou ao fim sozinho?
 *
 * É a pergunta que decide se o aviso agendado ainda vale, e errar nela mata a
 * feature justamente no caso que ela existe para atender. No Android o app em
 * segundo plano continua tiquendo o JS: o tique que zera o cronômetro roda,
 * limpa o `deadline` e cancelaria a notificação a caminho — a pessoa com o
 * celular no bolso nunca receberia nada. No iOS o app suspenso nem tiquea, e o
 * defeito ficaria invisível para quem testa só num aparelho.
 */
export function restWasInterrupted(deadline: number, now: number): boolean {
  return now < deadline;
}

export function createRestNotifications(notifier: RestNotifier): RestNotifications {
  let agendada: string | null = null;
  /**
   * Rodada corrente. O agendamento é assíncrono e o "pular" é síncrono: sem
   * este contador, quem pula enquanto o `schedule` está em voo guarda um id que
   * ninguém cancela.
   */
  let rodada = 0;
  /**
   * A resposta do sistema sobre a permissão, pedida no primeiro descanso e não
   * na abertura do app — permissão pedida sem contexto é permissão negada. Fica
   * guardada porque, entre uma série e outra, um diálogo do sistema a cada
   * descanso é o caminho mais curto para o app ser desinstalado. Quem liberar a
   * notificação nos ajustes depois disso é atendido no próximo início do app.
   */
  let permissao: Promise<boolean> | null = null;

  async function cancelar(): Promise<void> {
    rodada += 1;
    const id = agendada;
    agendada = null;
    if (id) await notifier.cancel(id);
  }

  async function agendar(deadline: number, now: number): Promise<void> {
    await cancelar();
    const minhaRodada = rodada;

    const seconds = restDelaySeconds(deadline, now);
    // Nem pergunta a permissão: um descanso que já acabou não justifica pôr um
    // diálogo do sistema na frente de quem está treinando.
    if (seconds == null) return;

    permissao ??= notifier.ensurePermission();
    // Negada, o descanso continua na tela com háptico e leitor de tela. A
    // notificação é o extra de quem guarda o celular no bolso.
    if (!(await permissao)) return;

    const id = await notifier.schedule(seconds);
    if (rodada !== minhaRodada) {
      await notifier.cancel(id);
      return;
    }
    agendada = id;
  }

  return {
    async schedule(deadline: number, now: number = Date.now()): Promise<void> {
      try {
        await agendar(deadline, now);
      } catch {
        // Quem chama daqui é um `useEffect`, que não tem como tratar rejeição:
        // ela viraria erro não tratado — tela vermelha no development build —
        // por causa de um aviso que é o extra. Zerar a permissão faz o próximo
        // descanso tentar de novo, em vez de guardar para sempre a resposta que
        // nunca chegou.
        permissao = null;
      }
    },
    async cancel(): Promise<void> {
      try {
        await cancelar();
      } catch {
        // O id já saiu do lugar e a rodada já virou; insistir não muda nada.
      }
    },
  };
}
