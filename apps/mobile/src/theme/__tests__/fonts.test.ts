import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES, fontFamilyFor } from '../fonts';

/**
 * O Android não sintetiza peso em fonte própria: cada peso é uma família. O
 * mapa precisa devolver sempre uma família carregada.
 */
describe('famílias por peso', () => {
  it('texto (Manrope) tem 400 a 800', () => {
    expect(fontFamilyFor('body', 400)).toBe('Manrope_400Regular');
    expect(fontFamilyFor('body', 600)).toBe('Manrope_600SemiBold');
    expect(fontFamilyFor('body', 800)).toBe('Manrope_800ExtraBold');
  });

  it('títulos e números (Sora) têm 600 e 700', () => {
    expect(fontFamilyFor('display', 700)).toBe('Sora_700Bold');
    expect(fontFamilyFor('display', 600)).toBe('Sora_600SemiBold');
  });

  it('peso que não foi carregado cai no mais próximo que foi', () => {
    expect(fontFamilyFor('display', 800)).toBe('Sora_700Bold');
    expect(fontFamilyFor('display', 400)).toBe('Sora_600SemiBold');
    expect(fontFamilyFor('body', 300)).toBe('Manrope_400Regular');
  });

  it('toda família do mapa é uma das carregadas no _layout', () => {
    const all = Object.values(FONT_FAMILIES).flatMap((f) => Object.values(f));
    expect(new Set(all).size).toBe(all.length);
    for (const name of all) expect(name).toMatch(/^(Sora|Manrope)_\d00[A-Za-z]+$/);
  });
});
