/**
 * O limiar e a supressão — o coração das #159 e #160.
 *
 * Função **pura**, sem Nest e sem Prisma, de propósito: toda leitura agregada do
 * produto (alertas de retenção e painel pago) passa por aqui, e um caminho que
 * não passe é vigilância com outro nome. Ser pura é o que permite testá-la
 * exaustivamente, inclusive por propriedade sobre distribuições aleatórias.
 *
 * A política que este arquivo implementa está escrita, e é pública, em
 * `docs/AGGREGATION_POLICY.md`. Os números moram **aqui** e só aqui — um segundo
 * limiar em outro arquivo é a forma mais provável de a promessa ser quebrada sem
 * ninguém notar.
 */

/**
 * Mínimo de indivíduos distintos para uma célula ser publicada.
 *
 * Constante no código, e não configurável por grupo: um `k` que a academia
 * ajusta vira `k = 1` no primeiro pedido comercial. Mudar exige diff e revisão.
 */
export const MIN_CELL = 5;

/** Marca que substitui o número no CSV e na resposta. */
export const SUPPRESSED = 'SUPPRESSED';

/** Célula crua, como sai de quem conta. Nunca sai desta forma pela API. */
export interface Cell {
  /** Rótulo do balde no eixo ("2026-07", "manhã", "peito"). Nunca uma pessoa. */
  key: string;
  /** Indivíduos distintos que compõem a célula. É sobre `n` que o limiar decide. */
  n: number;
  /** A métrica do recorte. */
  value: number;
}

/** Célula como a API a publica. `null` quando suprimida — nunca o número. */
export interface PublishedCell {
  key: string;
  value: number | null;
  /** `n` também some quando a célula é suprimida: "somos 3 aqui" já é o vazamento. */
  n: number | null;
  suppressed: boolean;
}

export interface Aggregate {
  cells: PublishedCell[];
  /**
   * Nenhuma célula sobrou visível. A UI mostra "amostra insuficiente" — e não
   * `0`, que é uma afirmação sobre as pessoas e não sobre a amostra.
   */
  insufficientSample: boolean;
}

/**
 * Aplica o limiar e a **supressão complementar**.
 *
 * Duas regras, e a segunda é a que existe por causa do modo de falha silencioso:
 *
 * 1. Célula com `0 < n < minCell` é suprimida. `n = 0` é publicada como está —
 *    não há ninguém a proteger num balde vazio.
 * 2. Se sobrar **exatamente uma** célula suprimida, a menor célula visível com
 *    `n > 0` também é suprimida. Uma célula oculta sozinha não está oculta:
 *    quem souber o total subtrai as visíveis e lê o número que o limiar
 *    recusou. Este é o "falha em silêncio" central da #159.
 *
 * O complemento **precisa** ter `n > 0`: suprimir um balde vazio ao lado do
 * balde pequeno é teatro, porque o valor de um balde vazio é conhecido (zero) e
 * a subtração continua funcionando.
 *
 * Quando não existe complemento elegível — recorte de uma célula só, ou de uma
 * célula pequena cercada de baldes vazios — o recorte inteiro é suprimido. É a
 * resposta certa: aquele recorte, naquele grupo, não é agregado.
 *
 * **O total não é publicado.** A soma das células é a arma do ataque por
 * diferença, e a UI não precisa dela: somar o que está visível ela faz sozinha,
 * e essa soma não revela nada. A supressão complementar continua existindo
 * porque o total pode ser sabido de fora (outro recorte, outro período, o
 * tamanho conhecido da turma).
 */
export function suppress(cells: readonly Cell[], minCell: number = MIN_CELL): Aggregate {
  const hidden = new Set<number>();

  cells.forEach((cell, i) => {
    if (cell.n > 0 && cell.n < minCell) hidden.add(i);
  });

  if (hidden.size === 1) {
    const complement = smallestVisibleWithPeople(cells, hidden);
    if (complement === undefined) {
      // Sem complemento não há como esconder a única célula oculta. Cai tudo.
      cells.forEach((_, i) => hidden.add(i));
    } else {
      hidden.add(complement);
    }
  }

  const published = cells.map((cell, i) => ({
    key: cell.key,
    value: hidden.has(i) ? null : cell.value,
    n: hidden.has(i) ? null : cell.n,
    suppressed: hidden.has(i),
  }));

  // "Amostra insuficiente" é não ter sobrado **gente** visível: um recorte cujas
  // únicas células publicadas são baldes vazios não informa nada e não deve
  // parecer que informa.
  const insufficientSample = !published.some((cell, i) => !cell.suppressed && cells[i].n > 0);

  return { cells: published, insufficientSample };
}

/**
 * A menor célula visível que tenha gente, para servir de complemento.
 *
 * Menor, e não maior, para minimizar a perda de informação — é a prática usual
 * de controle de divulgação estatística. O preço está registrado em
 * `docs/AGGREGATION_POLICY.md`: um complemento pequeno estreita o intervalo em
 * que o valor oculto pode estar; ele não o revela, que é o que o limiar promete.
 *
 * Desempate pela chave, para a resposta ser determinística — recorte que muda de
 * célula suprimida entre duas chamadas iguais vaza as duas.
 */
function smallestVisibleWithPeople(
  cells: readonly Cell[],
  hidden: ReadonlySet<number>,
): number | undefined {
  let escolhida: number | undefined;

  cells.forEach((cell, i) => {
    if (hidden.has(i) || cell.n === 0) return;
    if (escolhida === undefined) {
      escolhida = i;
      return;
    }
    const atual = cells[escolhida];
    if (cell.n < atual.n || (cell.n === atual.n && cell.key < atual.key)) escolhida = i;
  });

  return escolhida;
}

/**
 * O recorte inteiro suprimido, sem nem chegar a contar.
 *
 * Usado quando o grupo tem menos de `MIN_CELL` participantes: aí nenhuma célula
 * poderia passar, e ir ao banco só produziria números que seriam jogados fora —
 * com a chance de um deles escapar por um log ou uma métrica pelo caminho.
 */
export function insufficientSample(): Aggregate {
  return { cells: [], insufficientSample: true };
}
