import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O campo de mensagem ficou **visível e intocável** na primeira versão do chat.
 *
 * O `ChatView` fixava `h-[calc(100dvh-5rem)]` — tela cheia menos a barra de baixo. Mas ele vive
 * dentro de `<main className="pt-16 pb-24">`, então a caixa começa 4rem abaixo do topo e termina
 * 4rem **dentro** da `bottom-nav`, que é `fixed` com `z-50`. O campo aparecia na tela e não
 * aceitava foco, digitação nem envio: a barra estava por cima.
 *
 * O `pb-24` do `<main>` não segura isso. Padding do pai não contém filho com altura explícita —
 * o filho transborda.
 *
 * **Nenhum teste de componente pega este defeito**, e não é falha de quem os escreveu: o jsdom
 * não calcula layout nem empilhamento. Renderizar o `ChatView` e digitar funciona lá, porque não
 * existe barra nenhuma por cima. O que dá para amarrar é o **acordo entre os dois arquivos**, que
 * é onde o erro de fato mora — a mesma técnica que `mcp-url.test.ts` usa para não deixar a tela
 * divergir do controller.
 */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const LAYOUT = resolve(RAIZ, 'src/app/(app)/layout.tsx');
const CHAT = resolve(RAIZ, 'src/components/chat/chat-view.tsx');

/** `pt-16` → 4, `pb-24` → 6. A escala do Tailwind é 0.25rem por unidade. */
function remDaClasse(fonte: string, prefixo: 'pt' | 'pb'): number {
  const achado = fonte.match(new RegExp(`\\b${prefixo}-(\\d+)\\b`));
  if (!achado) throw new Error(`layout de (app) não declara ${prefixo}-*`);
  return Number(achado[1]) * 0.25;
}

describe('a caixa do chat cabe entre as duas barras', () => {
  const layout = readFileSync(LAYOUT, 'utf8');
  const chat = readFileSync(CHAT, 'utf8');

  it('o layout continua reservando espaço para as duas barras', () => {
    // Se alguém trocar o padding por outro mecanismo, o cálculo abaixo perde o sentido e este
    // caso cai primeiro — em vez de o chat quebrar em silêncio.
    expect(layout).toMatch(/<main[^>]*className="[^"]*\bpt-\d+\b[^"]*\bpb-\d+\b/);
  });

  it('o chat desconta a barra do topo E a de baixo', () => {
    const reservado = remDaClasse(layout, 'pt') + remDaClasse(layout, 'pb');

    const altura = chat.match(/h-\[calc\(100dvh-([\d.]+)rem\)\]/);
    expect(altura, 'ChatView precisa declarar a altura como calc(100dvh-Nrem)').not.toBeNull();

    // O defeito original: 5 (só a barra de baixo) contra os 10 que o layout reserva.
    expect(Number(altura![1])).toBe(reservado);
  });

  it('a barra de baixo continua fixa e por cima — é o que torna o erro invisível', () => {
    // Sem `fixed` + `z-50` a caixa transbordando seria só um respiro a menos, não um campo
    // inalcançável. É a combinação que transforma erro de cálculo em funcionalidade quebrada,
    // e é por isso que este caso mora aqui e não some numa limpeza.
    const nav = readFileSync(resolve(RAIZ, 'src/components/layout/bottom-nav.tsx'), 'utf8');

    expect(nav).toMatch(/\bfixed\b/);
    expect(nav).toMatch(/\bz-50\b/);
  });
});
