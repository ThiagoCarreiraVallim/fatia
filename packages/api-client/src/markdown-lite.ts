/**
 * Markdown restrito das dicas da comunidade (Fase 7a): parágrafo, lista com
 * `-`/`*`/`1.`, **negrito**, *itálico* e link `[texto](https://…)`. Nada mais.
 *
 * Parser próprio e não uma biblioteca: o texto é de terceiros (a equipe da
 * comunidade) e é mostrado a todo membro, então a saída é uma árvore de tokens
 * que web e app desenham com os próprios componentes — nunca HTML. Um
 * `<script>` escrito na dica sai como texto, e link que não é `https:` vira
 * texto também.
 */

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'link'; href: string; children: InlineToken[] };

export type BlockToken =
  | { type: 'paragraph'; children: InlineToken[] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] };

const ITEM = /^\s*(?:([-*])|(\d{1,3})[.)])\s+(.*)$/;

/** Só `https:`. `http:`, `javascript:`, `data:` e relativos viram texto. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseMarkdownLite(source: string): BlockToken[] {
  const blocks: BlockToken[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    }
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[3]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Inline: varre da esquerda para a direita procurando o primeiro marcador que
 * fecha. Marcador sem par fica como texto — a dica nunca "some" por um `*`
 * solto.
 */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let buffer = '';
  let i = 0;
  const pushText = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ type: 'bold', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    const ch = text[i];
    if ((ch === '*' || ch === '_') && text[i + 1] !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1 && text[end + 1] !== ch) {
        pushText();
        out.push({ type: 'italic', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const close = text.indexOf('](', i + 1);
      const end = close === -1 ? -1 : text.indexOf(')', close + 2);
      if (close > i + 1 && end !== -1) {
        const label = text.slice(i + 1, close);
        const href = safeHref(text.slice(close + 2, end));
        pushText();
        out.push(
          href
            ? { type: 'link', href, children: parseInline(label) }
            : { type: 'text', text: label },
        );
        i = end + 1;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  pushText();
  return out;
}

/** O texto sem marcação, para prévia de uma linha e leitores de tela. */
export function markdownLitePlainText(source: string): string {
  const inline = (tokens: InlineToken[]): string =>
    tokens.map((t) => (t.type === 'text' ? t.text : inline(t.children))).join('');
  return parseMarkdownLite(source)
    .map((b) => (b.type === 'paragraph' ? inline(b.children) : b.items.map(inline).join('; ')))
    .join(' ');
}
