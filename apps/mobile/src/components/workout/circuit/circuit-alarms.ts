import {
  circuitAlarms,
  circuitBadge,
  circuitNowLabel,
  type CircuitDefinition,
  type CircuitRun,
} from '@fatia/api-client';

/** Teto de avisos agendados de uma vez (o iOS guarda no máximo 64 por app). */
export const CIRCUIT_NOTICE_LIMIT = 40;

export interface CircuitNotice {
  /** Segundos a partir de agora. */
  seconds: number;
  title: string;
  body: string;
}

/**
 * As trocas do circuito como avisos do sistema (#380). Com a tela bloqueada o
 * JS para e o som da tela não toca; o aviso agendado toca no horário certo.
 * Reagendados a cada toque (pausa, pular), e cancelados ao voltar para a tela.
 */
export function circuitAlarmNotices(
  def: CircuitDefinition,
  run: CircuitRun,
  now: number,
): CircuitNotice[] {
  const alarms = circuitAlarms(def, run, now, CIRCUIT_NOTICE_LIMIT);
  const emom = def.format === 'EMOM';
  const works = alarms.filter((a) => a.kind === 'work');
  const total = emom
    ? Math.ceil((def.config.durationSeconds ?? 0) / 60)
    : (def.config.intervals ?? works.length);
  const exercise = (i: number | null) => (i === null ? undefined : def.exercises[i]);
  const done = `${circuitBadge(def.format).label} concluído`;

  return alarms.map((a, k) => {
    const seconds = Math.max(1, Math.round((a.at - now) / 1000));
    if (a.kind === 'done')
      return { seconds, title: done, body: 'Abra o app para salvar o treino.' };
    const nextWork = alarms.slice(k + 1).find((x) => x.kind === 'work');
    const following = exercise(nextWork?.exerciseIndex ?? null)?.name ?? 'fim';
    if (a.kind === 'rest') return { seconds, title: 'Descanse', body: `a seguir · ${following}` };
    const item = exercise(a.exerciseIndex);
    const number = total - works.length + works.indexOf(a) + 1;
    if (emom) {
      return {
        seconds,
        title: `Minuto ${number}${item ? ` · ${circuitNowLabel(item)}` : ''}`,
        body: `a seguir · ${following}`,
      };
    }
    if (def.format === 'FOR_TIME') {
      return { seconds, title: 'Fim do descanso', body: item ? circuitNowLabel(item) : '' };
    }
    return {
      seconds,
      title: `Trabalhe${item ? ` · ${item.name}` : ''}`,
      body: `intervalo ${number} de ${total}`,
    };
  });
}

export const CIRCUIT_CHANNEL_ID = 'workout-circuit';
export const CIRCUIT_NOTIFICATION_KIND = 'workout-circuit';

/** Com o app aberto, a tela do relógio já apita e vibra: o aviso não precisa de tarja. */
export function isCircuitNotification(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    data.kind === CIRCUIT_NOTIFICATION_KIND
  );
}
