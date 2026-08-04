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
 *
 * O mesmo número serve de piso para o **bloco oculto** (ver `blocoSeguro`): o
 * conjunto de células suprimidas precisa somar pelo menos tanta gente quanto uma
 * célula que teríamos publicado.
 */
export const MIN_CELL = 5;

/** Marca que substitui o número no CSV e na resposta. */
export const SUPPRESSED = 'SUPPRESSED';

/** Célula crua, como sai de quem conta. Nunca sai desta forma pela API. */
export interface Cell {
  /**
   * Rótulo do balde no eixo ("2026-07", "manhã", "peito"). Nunca uma pessoa, e
   * nunca texto livre: todo eixo do catálogo é lista fechada ou balde de tempo.
   * O eixo aberto foi o furo da revisão — `modality_mix` carregava o nome que um
   * aluno digitou, e a **existência** dessa célula já era a divulgação, num
   * lugar que o limiar não alcança porque ele decide sobre o valor, não sobre a
   * chave.
   */
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
 * ## O que mudou depois da revisão, e por quê
 *
 * A primeira versão desta função escolhia o complemento como "a menor célula
 * visível **desta consulta**", e disparava só quando sobrava exatamente uma
 * célula oculta. As duas decisões estavam erradas, cada uma por um motivo:
 *
 * 1. **Relativa à consulta.** Os períodos nomeados são janelas *encaixadas* e o
 *    balde de um recorte de tempo é o mesmo em todas elas (a semana só contém as
 *    sessões daquela semana). Como "a menor visível" depende do conjunto de
 *    células da janela pedida, o complemento mudava de janela para janela — e a
 *    segunda consulta publicava exatamente o que a primeira tinha escondido.
 *    Duas requisições ao painel gratuito, sem construtor de filtro nenhum,
 *    devolviam o número inteiro.
 * 2. **Só quando `hidden.size === 1`.** Com duas células naturalmente pequenas
 *    nenhum complemento entrava, e o resíduo `total − visíveis` era a soma de
 *    duas parcelas que valiam 1 cada — cada uma recuperada exatamente.
 *
 * ## A regra de hoje
 *
 * 1. Célula com `0 < n < minCell` é suprimida. `n = 0` é publicada como está —
 *    não há ninguém a proteger num balde vazio, e um balde vazio nem participa
 *    da conta: zero é valor conhecido, não muda resíduo nenhum.
 * 2. Cada célula suprimida pelo limiar é uma **semente**, e cada semente monta o
 *    **seu** bloco: ela absorve vizinhos até o bloco ficar **seguro**
 *    (`blocoSeguro`). O conjunto oculto é a união dos blocos.
 * 3. O bloco cresce **para a direita** — em direção ao presente. Só quando já
 *    encosta na borda direita do eixo é que ele passa a crescer para a esquerda.
 * 4. Semente cujo bloco não consegue ficar seguro derruba o recorte inteiro. É a
 *    resposta certa: aquele recorte, naquele grupo, não é agregado.
 *
 * ## Por que o bloco é **por semente**, e não um bloco por vizinhança
 *
 * A tentação é agrupar as ocultas em blocos contíguos e crescer cada grupo. Isso
 * reabre o vazamento pela porta dos fundos: na janela longa aparece uma semente
 * a mais, à esquerda, que se funde com o grupo — e o grupo fundido pode já estar
 * seguro **sem** precisar absorver o vizinho da direita que a janela curta tinha
 * absorvido. Aquele vizinho sai publicado na janela longa e a subtração volta.
 *
 * Com bloco por semente, `bloco(s)` é função de `s` e das células **à direita**
 * de `s`, e de mais nada. Semente nova à esquerda não muda bloco nenhum.
 *
 * ## Por que "para a direita" fecha o vazamento entre consultas
 *
 * As três janelas terminam todas em `now`; elas diferem só onde **começam**.
 * Logo o vizinho à direita de um balde é o mesmo balde em `last_30_days`,
 * `last_90_days` e `last_12_months`. Crescer para a direita torna a decisão de
 * suprimir uma função do balde e dos baldes à direita dele — todos compartilhados
 * pelas três janelas — e não do recorte pedido. Célula oculta na janela curta
 * continua oculta na janela longa, que é a invariante que a revisão derrubou.
 *
 * A ida para a esquerda só acontece quando o bloco já toca a borda direita, e aí
 * os baldes à esquerda também são compartilhados — até o ponto em que a janela
 * curta acaba. Se o bloco precisar passar desse ponto, a janela curta não tem
 * mais para onde crescer e suprime **tudo**: não publica nada, e o que não é
 * publicado não entra em subtração nenhuma. Falha para o lado seguro.
 *
 * O preço está registrado em `docs/AGGREGATION_POLICY.md`: o complemento deixou
 * de ser "a menor célula visível" (que minimizava a perda de informação) e passou
 * a ser o vizinho. Perde-se mais utilidade; ganha-se a única versão da regra que
 * sobrevive a duas consultas.
 *
 * **O total não é publicado.** A soma das células é a arma do ataque por
 * diferença, e a UI não precisa dela. A supressão complementar continua
 * existindo porque o total pode ser sabido de fora — inclusive de um recorte
 * irmão sobre a mesma população, que foi como a revisão montou o ataque:
 * `sessions_by_week` e `sessions_by_hour_band` particionam as mesmas sessões.
 */
export function suppress(cells: readonly Cell[], minCell: number = MIN_CELL): Aggregate {
  // Só as células **com gente** entram na conta. Um balde vazio vale zero em
  // qualquer resíduo: escondê-lo seria teatro, e mantê-lo no meio do bloco
  // quebraria a noção de vizinhança sem proteger nada.
  const comGente = cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell.n > 0);

  const sementes = comGente
    .map((_, posicao) => posicao)
    .filter((posicao) => comGente[posicao].cell.n < minCell);

  const ocultas = new Set<number>();
  for (const semente of sementes) {
    const bloco = blocoDaSemente(comGente, semente, minCell);
    if (bloco === undefined) return tudoSuprimido(cells);
    for (const posicao of bloco) ocultas.add(posicao);
  }

  const indicesOcultos = new Set([...ocultas].map((posicao) => comGente[posicao].i));

  const published = cells.map((cell, i) => ({
    key: cell.key,
    value: indicesOcultos.has(i) ? null : cell.value,
    n: indicesOcultos.has(i) ? null : cell.n,
    suppressed: indicesOcultos.has(i),
  }));

  // "Amostra insuficiente" é não ter sobrado **gente** visível: um recorte cujas
  // únicas células publicadas são baldes vazios não informa nada e não deve
  // parecer que informa.
  const insufficientSample = !published.some((cell, i) => !cell.suppressed && cells[i].n > 0);

  return { cells: published, insufficientSample };
}

/** Célula com gente e o índice dela no recorte original. */
type ComGente = { cell: Cell; i: number };

/**
 * Um bloco oculto está seguro quando o resíduo não isola ninguém.
 *
 * Três condições, e cada uma fecha um ataque diferente:
 *
 * - **Duas células, no mínimo.** Uma incógnita só é uma equação resolvida.
 * - **`n` somado ≥ `minCell`.** O bloco precisa esconder pelo menos tanta gente
 *   quanto uma célula que teríamos publicado. Sem isto, duas células de uma
 *   pessoa cada satisfariam a condição anterior e continuariam sendo duas
 *   pessoas identificáveis.
 * - **Folga no valor: `soma − quantas ≥ minCell`.** Quem conhece o total sabe o
 *   resíduo; para cada célula do bloco o valor possível vai de 1 (o mínimo de
 *   quem aparece) até `resíduo − (quantas − 1)`. A largura desse intervalo é
 *   `soma − quantas`. Quando ela é zero, todas as parcelas valem 1 e o bloco
 *   inteiro está publicado por dedução — foi exatamente o caso `1 + 1 = 2` que a
 *   revisão exibiu. Exigir `minCell` de largura é a versão redonda de "o
 *   intervalo tem de ser largo o bastante para não ser uma resposta".
 */
function blocoSeguro(comGente: readonly ComGente[], bloco: readonly number[], minCell: number) {
  if (bloco.length < 2) return false;

  const somaN = bloco.reduce((soma, posicao) => soma + comGente[posicao].cell.n, 0);
  if (somaN < minCell) return false;

  const somaValor = bloco.reduce((soma, posicao) => soma + comGente[posicao].cell.value, 0);
  return somaValor - bloco.length >= minCell;
}

/**
 * O bloco de uma semente: ela e os vizinhos que precisou absorver para ficar
 * segura. `undefined` quando o eixo acabou antes — e aí o recorte inteiro cai.
 *
 * Cresce para a **direita** enquanto houver eixo à direita, e só depois para a
 * esquerda. É esta ordem que torna o bloco função apenas da semente e do que
 * está à direita dela — ver o comentário de `suppress`.
 */
function blocoDaSemente(
  comGente: readonly ComGente[],
  semente: number,
  minCell: number,
): number[] | undefined {
  const bloco = [semente];
  let direita = semente + 1;
  let esquerda = semente - 1;

  while (!blocoSeguro(comGente, bloco, minCell)) {
    if (direita < comGente.length) bloco.push(direita++);
    else if (esquerda >= 0) bloco.unshift(esquerda--);
    else return undefined;
  }

  return bloco;
}

/** O recorte inteiro cai — inclusive os baldes vazios, para não sobrar borda. */
function tudoSuprimido(cells: readonly Cell[]): Aggregate {
  return {
    cells: cells.map((cell) => ({ key: cell.key, value: null, n: null, suppressed: true })),
    insufficientSample: true,
  };
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
