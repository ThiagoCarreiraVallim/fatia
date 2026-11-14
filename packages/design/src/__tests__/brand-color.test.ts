import { describe, expect, it } from 'vitest';
import {
  BRAND_DARK_TEXT,
  BRAND_LIGHT_TEXT,
  FATIA_GREEN,
  MIN_TEXT_CONTRAST,
  checkBrandColor,
  isNearFatiaGreen,
  oklabDistance,
} from '../brand-color';
import { contrastRatio } from '../contrast';

describe('checkBrandColor', () => {
  it('laranja padrão (#FF7A1A) passa com texto escuro', () => {
    const r = checkBrandColor('#FF7A1A');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.text).toBe(BRAND_DARK_TEXT);
    expect(r.contrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('azul escuro passa com texto branco', () => {
    const r = checkBrandColor('#1D4ED8');
    expect(r).toMatchObject({ status: 'ok', text: BRAND_LIGHT_TEXT });
  });

  it('roxo #7C5CFF não passa com nenhum texto: avisa e sugere um tom ≈ #6A4AE0', () => {
    const r = checkBrandColor('#7C5CFF');
    expect(r.status).toBe('warning');
    if (r.status !== 'warning') return;
    // A sugestão passa com folga e fica no mesmo matiz do original.
    expect(contrastRatio(r.suggestion, r.suggestionText)).toBeGreaterThanOrEqual(5.5);
    expect(r.suggestionText).toBe(BRAND_LIGHT_TEXT);
    expect(oklabDistance(r.suggestion, '#6A4AE0')).toBeLessThan(0.02);
    expect(r.message).toMatch(/4,5:1/);
    expect(r.message).toContain(r.suggestion.toUpperCase());
  });

  it('cor clara sem contraste é clareada até o texto escuro passar', () => {
    // Cinza médio: o texto escuro ganha (4,4:1), mas não chega a 4,5.
    const r = checkBrandColor('#7D7D7D');
    expect(r.status).toBe('warning');
    if (r.status !== 'warning') return;
    expect(r.suggestionText).toBe(BRAND_DARK_TEXT);
    expect(contrastRatio(r.suggestion, r.suggestionText)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(['#2CE500', '#2EE600', '#5CFF2E', '#00FF00', '#3BD80A'])(
    'verde próximo do Fatia (%s) é recusado',
    (verde) => {
      const r = checkBrandColor(verde);
      expect(r.status).toBe('rejected');
      if (r.status !== 'rejected') return;
      expect(r.reason).toBe('fatia-green');
      expect(r.message).toMatch(/verde do Fatia/);
    },
  );

  it.each(['#2563EB', '#EF4444', '#FF7A1A', '#7C5CFF', '#0E7468', '#22C55E'])(
    'cor distante do verde (%s) não é recusada',
    (cor) => {
      expect(isNearFatiaGreen(cor)).toBe(false);
      expect(checkBrandColor(cor).status).not.toBe('rejected');
    },
  );

  it('valor que não é hex é recusado como inválido', () => {
    expect(checkBrandColor('laranja')).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('a cor de referência é o verde da marca', () => {
    expect(FATIA_GREEN).toBe('#2ce500');
  });
});
