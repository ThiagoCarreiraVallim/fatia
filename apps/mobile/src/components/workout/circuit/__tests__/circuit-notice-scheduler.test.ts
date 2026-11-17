import { describe, expect, it, vi } from 'vitest';
import type { CircuitNotice } from '../circuit-alarms';
import { createCircuitNoticeScheduler } from '../circuit-notice-scheduler';

/** Revisão C6 da #380: o agendamento é assíncrono e a pessoa pode voltar no meio dele. */
function setup() {
  const pending: Array<(ids: string[]) => void> = [];
  const schedule = vi.fn(
    (_notices: CircuitNotice[]) => new Promise<string[]>((resolve) => pending.push(resolve)),
  );
  const cancel = vi.fn();
  const notice: CircuitNotice = { seconds: 10, at: 10_000, title: 'Descanse', body: '' };
  const scheduler = createCircuitNoticeScheduler({
    notices: () => [notice],
    schedule,
    cancel,
    now: () => 0,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { scheduler, schedule, cancel, pending, flush };
}

describe('avisos do circuito entre o fundo e a volta ao app', () => {
  it('voltar antes de o agendamento terminar cancela o que ele agendou', async () => {
    const { scheduler, cancel, pending, flush } = setup();
    scheduler.background();
    scheduler.active();
    pending[0]!(['a', 'b']);
    await flush();
    expect(cancel).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('depois disso, ir de novo para o fundo agenda de novo', async () => {
    const { scheduler, schedule, pending, flush } = setup();
    scheduler.background();
    scheduler.active();
    pending[0]!(['a']);
    await flush();
    scheduler.background();
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('agendado e voltou: cancela os avisos; no fundo de novo sem voltar, não duplica', async () => {
    const { scheduler, schedule, cancel, pending, flush } = setup();
    scheduler.background();
    scheduler.background();
    expect(schedule).toHaveBeenCalledTimes(1);
    pending[0]!(['a']);
    await flush();
    scheduler.background();
    expect(schedule).toHaveBeenCalledTimes(1);
    scheduler.active();
    expect(cancel).toHaveBeenLastCalledWith(['a']);
  });

  it('sair da tela cancela tudo, inclusive o que ainda estava agendando', async () => {
    const { scheduler, cancel, pending, flush } = setup();
    scheduler.background();
    scheduler.dispose();
    pending[0]!(['a']);
    await flush();
    expect(cancel).toHaveBeenLastCalledWith(['a']);
  });
});
