import { describe, expect, it } from 'vitest';
import {
  copyDayText,
  dayLabel,
  defaultCopyTarget,
  shiftDay,
  templateSummary,
} from '../meal-templates';

const HOJE = '2026-10-14';

describe('dias', () => {
  it('desloca o dia, atravessando mês e ano', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('nome do dia relativo a hoje', () => {
    expect(dayLabel(HOJE, HOJE)).toBe('hoje');
    expect(dayLabel('2026-10-13', HOJE)).toBe('ontem');
    expect(dayLabel('2026-10-15', HOJE)).toBe('amanhã');
    expect(dayLabel('2026-10-09', HOJE)).toBe('sex, 09/10');
  });

  it('copiar de outro dia vai para hoje; de hoje, para amanhã', () => {
    expect(defaultCopyTarget('2026-10-13', HOJE)).toBe(HOJE);
    expect(defaultCopyTarget(HOJE, HOJE)).toBe('2026-10-15');
  });
});

describe('refeição salva', () => {
  const item = (kcal: number) => ({ kcal });

  it('resume itens e calorias', () => {
    expect(templateSummary({ items: [item(150.4), item(80), item(290)] } as never)).toBe(
      '3 itens · 520 kcal',
    );
    expect(templateSummary({ items: [item(64)] } as never)).toBe('1 item · 64 kcal');
  });
});

describe('copyDayText', () => {
  it('quantas foram e quantas já estavam lá', () => {
    expect(copyDayText({ created: [1, 2], skipped: 0 })).toBe('2 refeições copiadas');
    expect(copyDayText({ created: [1], skipped: 1 })).toBe('1 refeição copiada · 1 já estava lá');
    expect(copyDayText({ created: [1], skipped: 2 })).toBe('1 refeição copiada · 2 já estavam lá');
  });

  it('nada novo: diz que já estava tudo lá', () => {
    expect(copyDayText({ created: [], skipped: 3 })).toBe('Essas refeições já estavam lá');
  });
});
