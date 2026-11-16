/**
 * Faixas que rolam de lado (os chips das séries na sessão, prancha Al-T3): a
 * conta de quanto rolar para o item da vez ficar à vista, a mesma no PWA e no
 * app. Antes, na série 4 de 4 só os dois primeiros chips apareciam e era
 * preciso abrir o "Todas" para ver a da vez.
 */

/**
 * O deslocamento que deixa o item inteiro à vista, mexendo o mínimo: à vista,
 * fica onde está; passando de uma borda, encosta nela com `margin` de respiro.
 * Nunca sai do começo nem do fim da faixa.
 */
export function revealOffset({
  offset,
  viewport,
  content,
  itemStart,
  itemEnd,
  margin = 0,
}: {
  /** Quanto já está rolado. */
  offset: number;
  /** Largura visível da faixa. */
  viewport: number;
  /** Largura de todo o conteúdo da faixa. */
  content: number;
  itemStart: number;
  itemEnd: number;
  margin?: number;
}): number {
  const max = Math.max(0, content - viewport);
  let next = offset;
  if (itemEnd + margin > offset + viewport) next = itemEnd + margin - viewport;
  if (itemStart - margin < next) next = itemStart - margin;
  return Math.min(max, Math.max(0, next));
}

/**
 * O chip da vez numa linha de séries: a próxima a fazer ou, com o exercício
 * completo, a última feita. `null` sem chip nenhum.
 */
export function currentChipIndex({
  done,
  target,
}: {
  done: number;
  target: number;
}): number | null {
  const total = Math.max(done, target);
  if (total === 0) return null;
  return done < target ? done : total - 1;
}
