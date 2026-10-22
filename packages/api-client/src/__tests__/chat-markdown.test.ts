import { describe, expect, it } from 'vitest';
import { chatMarkdownPlainText, parseChatInline, parseChatMarkdown } from '../chat-markdown';

describe('parseChatMarkdown', () => {
  it('título, lista, código e tabela, como o modelo escreve', () => {
    const blocos = parseChatMarkdown(
      [
        '## Proteína de hoje',
        'Você comeu **92 g**.',
        '',
        '- Almoço: 40 g',
        '- Jantar: 52 g',
        '',
        '| Refeição | g |',
        '| --- | ---: |',
        '| Almoço | 40 |',
        '| Jantar | 52 |',
        '',
        '```',
        'total = 92',
        '```',
      ].join('\n'),
    );
    expect(blocos.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'table', 'code']);
    const tabela = blocos[3] as Extract<(typeof blocos)[number], { type: 'table' }>;
    expect(tabela.rows).toHaveLength(2);
    expect(blocos[4]).toEqual({ type: 'code', text: 'total = 92' });
  });

  it('crase vira código literal: o asterisco dentro não é itálico', () => {
    expect(parseChatInline('use `a*b*c` aqui')).toEqual([
      { type: 'text', text: 'use ' },
      { type: 'code', text: 'a*b*c' },
      { type: 'text', text: ' aqui' },
    ]);
  });

  it('nunca HTML, e link que não é https vira texto', () => {
    const blocos = parseChatMarkdown('<script>x</script> [clique](javascript:alert(1))');
    expect(JSON.stringify(blocos)).not.toContain('"link"');
    expect(chatMarkdownPlainText('<b>oi</b>')).toBe('<b>oi</b>');
  });

  it('texto puro para copiar', () => {
    expect(chatMarkdownPlainText('# Oi\n\n**forte** e `cod`')).toBe('Oi\n\nforte e cod');
  });
});
