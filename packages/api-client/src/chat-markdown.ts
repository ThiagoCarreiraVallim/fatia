import { parseInline, type InlineToken } from './markdown-lite';

/**
 * O markdown das respostas do chat no app nativo (Fase 9e).
 *
 * O modelo escreve título, lista, **negrito**, `código`, bloco de código e
 * tabela — mais do que o markdown restrito das dicas (`markdown-lite.ts`), que
 * fica como está porque é texto de terceiros. Aqui o texto é do modelo, mas a
 * regra é a mesma: a saída é uma árvore de tokens que o app desenha com os
 * próprios componentes, nunca HTML, e link que não é `https:` vira texto.
 */

export type ChatInlineToken = InlineToken | { type: 'code'; text: string };

export type ChatBlockToken =
  | { type: 'paragraph'; children: ChatInlineToken[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: ChatInlineToken[] }
  | { type: 'list'; ordered: boolean; items: ChatInlineToken[][] }
  | { type: 'code'; text: string }
  | { type: 'table'; header: ChatInlineToken[][]; rows: ChatInlineToken[][][] };

const ITEM = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Inline com `código`: o trecho entre crases sai literal, o resto passa pelo inline das dicas. */
export function parseChatInline(text: string): ChatInlineToken[] {
  const out: ChatInlineToken[] = [];
  let resto = text;
  for (;;) {
    const ini = resto.indexOf('`');
    const fim = ini === -1 ? -1 : resto.indexOf('`', ini + 1);
    if (ini === -1 || fim === -1) {
      if (resto) out.push(...parseInline(resto));
      return out;
    }
    if (ini > 0) out.push(...parseInline(resto.slice(0, ini)));
    out.push({ type: 'code', text: resto.slice(ini + 1, fim) });
    resto = resto.slice(fim + 1);
  }
}

function cells(linha: string): ChatInlineToken[][] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseChatInline(c.trim()));
}

export function parseChatMarkdown(source: string): ChatBlockToken[] {
  const blocks: ChatBlockToken[] = [];
  const linhas = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', children: parseChatInline(paragraph.join(' ')) });
    }
    paragraph = [];
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseChatInline) });
    }
    list = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trimEnd();
    if (linha.trim().startsWith('```')) {
      flush();
      const codigo: string[] = [];
      for (i += 1; i < linhas.length && !linhas[i].trim().startsWith('```'); i++) {
        codigo.push(linhas[i]);
      }
      blocks.push({ type: 'code', text: codigo.join('\n') });
      continue;
    }
    if (!linha.trim()) {
      flush();
      continue;
    }
    const titulo = HEADING.exec(linha);
    if (titulo) {
      flush();
      const level = Math.min(titulo[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, children: parseChatInline(titulo[2]) });
      continue;
    }
    if (TABLE_ROW.test(linha) && i + 1 < linhas.length && TABLE_RULE.test(linhas[i + 1])) {
      flush();
      const header = cells(linha);
      const rows: ChatInlineToken[][][] = [];
      for (i += 2; i < linhas.length && TABLE_ROW.test(linhas[i]); i++) rows.push(cells(linhas[i]));
      i -= 1;
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    const item = ITEM.exec(linha);
    if (item) {
      if (paragraph.length) {
        blocks.push({ type: 'paragraph', children: parseChatInline(paragraph.join(' ')) });
        paragraph = [];
      }
      const ordered = item[2] !== undefined;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[3]);
      continue;
    }
    if (list) flush();
    paragraph.push(linha.trim());
  }
  flush();
  return blocks;
}

/** O texto sem marcação, para copiar e para leitor de tela. */
export function chatMarkdownPlainText(source: string): string {
  const inline = (tokens: ChatInlineToken[]): string =>
    tokens
      .map((t) => (t.type === 'text' || t.type === 'code' ? t.text : inline(t.children)))
      .join('');
  return parseChatMarkdown(source)
    .map((b) => {
      if (b.type === 'code') return b.text;
      if (b.type === 'list') return b.items.map(inline).join('\n');
      if (b.type === 'table')
        return [b.header, ...b.rows].map((r) => r.map(inline).join(' | ')).join('\n');
      return inline(b.children);
    })
    .join('\n\n');
}
