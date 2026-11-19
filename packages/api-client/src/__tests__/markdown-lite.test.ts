import { describe, expect, it } from 'vitest';
import { markdownLitePlainText, parseMarkdownLite } from '../markdown-lite';

/** Título e citação do mural (#394, prancha Cm-06): `# título` e `> citação`. */
describe('markdown-lite do mural', () => {
  it('título e citação viram blocos, com inline dentro', () => {
    expect(parseMarkdownLite('# Pernas da **semana**\ntexto\n> Se chover, _sala 2_.')).toEqual([
      {
        type: 'heading',
        children: [
          { type: 'text', text: 'Pernas da ' },
          { type: 'bold', children: [{ type: 'text', text: 'semana' }] },
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'texto' }] },
      {
        type: 'quote',
        children: [
          { type: 'text', text: 'Se chover, ' },
          { type: 'italic', children: [{ type: 'text', text: 'sala 2' }] },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });

  it('### e ## também são título; # sem espaço é texto', () => {
    expect(parseMarkdownLite('### Oi')[0]).toMatchObject({ type: 'heading' });
    expect(parseMarkdownLite('#hashtag')[0]).toMatchObject({ type: 'paragraph' });
  });

  it('texto puro inclui título e citação', () => {
    expect(markdownLitePlainText('# Título\n> citação')).toBe('Título citação');
  });
});
