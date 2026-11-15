import { describe, expect, it } from 'vitest';
import type { ProBlockState } from '../billing';
import { proBlockCopy } from '../pro-block-copy';

const ALL: ProBlockState[] = [
  { kind: 'free', trialDays: 7 },
  { kind: 'trial', day: 4, totalDays: 7, daysLeft: 3 },
  { kind: 'pro', interval: 'YEARLY', renewsAt: '2027-01-10T00:00:00Z' },
  { kind: 'pro-community', groupName: 'Academia' },
  { kind: 'pro-until', until: '2026-12-01T00:00:00Z', daysLeft: 1 },
  { kind: 'lite-ending', remaining: 2, limit: 10 },
  { kind: 'free-no-purchase' },
  { kind: 'pending-grace', aiUntil: '2026-11-20T00:00:00Z', graceDaysLeft: 6 },
  { kind: 'pro-expired' },
];

describe('proBlockCopy', () => {
  it('tem texto para os 9 estados', () => {
    const titles = ALL.map((s) => proBlockCopy(s).title);
    expect(new Set(titles).size).toBe(9);
    for (const t of titles) expect(t.length).toBeGreaterThan(0);
  });

  it('sem compra no app (iOS) nunca oferece assinar ou pagar', () => {
    for (const s of ALL) {
      const { action } = proBlockCopy(s, false);
      expect(action ?? '').not.toMatch(/assinar|pagar|teste/i);
    }
  });

  it('PRO pela comunidade não tem ação e mostra o grupo', () => {
    const c = proBlockCopy({ kind: 'pro-community', groupName: 'Academia' });
    expect(c.action).toBeNull();
    expect(c.title).toBe('PRO · Academia');
  });

  it('singular e plural em dias', () => {
    expect(
      proBlockCopy({ kind: 'pro-until', until: '2026-12-01T00:00:00Z', daysLeft: 1 }).body,
    ).toContain('1 dia.');
    expect(proBlockCopy({ kind: 'trial', day: 4, totalDays: 7, daysLeft: 3 }).body).toContain(
      '3 dias',
    );
  });

  it('quem está perdendo acesso recebe o tom de atenção', () => {
    expect(proBlockCopy({ kind: 'pending-grace', aiUntil: null, graceDaysLeft: 2 }).tone).toBe(
      'attention',
    );
    expect(proBlockCopy({ kind: 'lite-ending', remaining: 1, limit: 10 }).tone).toBe('attention');
  });
});
