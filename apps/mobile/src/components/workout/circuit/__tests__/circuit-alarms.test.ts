import { describe, expect, it } from 'vitest';
import type { CircuitDefinition } from '@fatia/api-client';
import {
  circuitAlarmNotices,
  CIRCUIT_NOTICE_LIMIT,
  CIRCUIT_NOTIFICATION_KIND,
  isCircuitNotification,
} from '../circuit-alarms';

const tabata: CircuitDefinition = {
  format: 'TABATA',
  name: 'Tabata de core',
  config: { workSeconds: 20, restSeconds: 10, intervals: 2 },
  exercises: [
    { exerciseId: 1, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
    { exerciseId: 2, name: 'Abdominal', muscleGroup: 'core', unit: 'REPS', target: 10 },
  ],
};

describe('avisos do sistema para o circuito com a tela bloqueada', () => {
  it('cada troca vira um aviso em segundos a partir de agora, com o que fazer', () => {
    const notices = circuitAlarmNotices(tabata, { startedAt: 0, events: [] }, 5_000);
    expect(notices).toEqual([
      { seconds: 15, title: 'Descanse', body: 'a seguir · Abdominal' },
      { seconds: 25, title: 'Trabalhe · Abdominal', body: 'intervalo 2 de 2' },
      { seconds: 45, title: 'Descanse', body: 'a seguir · fim' },
      { seconds: 55, title: 'Tabata concluído', body: 'Abra o app para salvar o treino.' },
    ]);
  });

  it('EMOM fala o minuto; AMRAP só o fim; pausado, nada', () => {
    const emom = { ...tabata, format: 'EMOM' as const, config: { durationSeconds: 120 } };
    expect(circuitAlarmNotices(emom, { startedAt: 0, events: [] }, 0)[0]).toEqual({
      seconds: 60,
      title: 'Minuto 2 · Abdominal × 10',
      body: 'a seguir · fim',
    });
    const amrap = { ...tabata, format: 'AMRAP' as const, config: { durationSeconds: 600 } };
    expect(circuitAlarmNotices(amrap, { startedAt: 0, events: [] }, 0)).toEqual([
      { seconds: 600, title: 'AMRAP concluído', body: 'Abra o app para salvar o treino.' },
    ]);
    expect(
      circuitAlarmNotices(tabata, { startedAt: 0, events: [{ type: 'pause', at: 1_000 }] }, 2_000),
    ).toEqual([]);
  });

  it('não passa do teto de avisos agendados, e o de fim fica sempre (revisão C5)', () => {
    const long = { ...tabata, config: { workSeconds: 20, restSeconds: 10, intervals: 60 } };
    const notices = circuitAlarmNotices(long, { startedAt: 0, events: [] }, 0);
    expect(notices).toHaveLength(CIRCUIT_NOTICE_LIMIT);
    expect(notices.at(-1)).toEqual({
      seconds: 1800,
      title: 'Tabata concluído',
      body: 'Abra o app para salvar o treino.',
    });
    // O último descanso da lista cortada não diz "fim": o circuito segue.
    expect(notices.at(-2)?.body).not.toBe('a seguir · fim');
  });

  it('cada intervalo leva o próprio número, mesmo com a lista cortada (revisão C5)', () => {
    const long = { ...tabata, config: { workSeconds: 20, restSeconds: 10, intervals: 60 } };
    const works = circuitAlarmNotices(long, { startedAt: 0, events: [] }, 0).filter((n) =>
      n.title.startsWith('Trabalhe'),
    );
    expect(works[0]?.body).toBe('intervalo 2 de 60');
    expect(works[1]?.body).toBe('intervalo 3 de 60');
    // No meio do circuito: o aviso do intervalo 31 diz 31.
    const middle = circuitAlarmNotices(long, { startedAt: 0, events: [] }, 29 * 30_000 + 25_000);
    expect(middle.find((n) => n.title.startsWith('Trabalhe'))?.body).toBe('intervalo 31 de 60');
  });
});

describe('isCircuitNotification', () => {
  it('reconhece o aviso do circuito, e só ele (o app aberto já apita na tela)', () => {
    expect(isCircuitNotification({ kind: CIRCUIT_NOTIFICATION_KIND })).toBe(true);
    expect(isCircuitNotification({ kind: 'workout-rest' })).toBe(false);
    expect(isCircuitNotification(null)).toBe(false);
  });
});
