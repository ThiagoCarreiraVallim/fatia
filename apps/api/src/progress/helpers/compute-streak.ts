/**
 * Sequência com tolerância a falha (issue #147).
 *
 * A versão anterior parava no primeiro período sem registro — exatamente o que a issue proíbe:
 * um dia perdido zerava meses de trabalho, e streak que pune desproporcionalmente faz o usuário
 * desistir de vez em vez de voltar.
 *
 * Regra: a sequência tem um **orçamento de faltas**. Começa com uma falta liberada e ganha mais
 * uma a cada 7 períodos ativos, saturando em duas. A sequência quebra na **segunda falta
 * consecutiva** — mesmo com orçamento sobrando — ou quando o orçamento acaba. Duas faltas
 * seguidas são "parei", não "escorreguei"; é essa diferença que o orçamento existe para marcar.
 *
 * A função é pura e não sabe o que é um dia: recebe as chaves dos períodos ativos já convertidas
 * para o fuso do usuário e um `anterior()` que anda para trás. É o que permite usar a mesma regra
 * para dias (`YYYY-MM-DD`) e para semanas (a segunda-feira, `YYYY-MM-DD`).
 */

export interface StreakTolerance {
  /** Faltas liberadas antes de qualquer período ativo acumular orçamento. */
  faltasIniciais: number;
  /** Períodos ativos necessários para ganhar mais uma falta. */
  ganhaACada: number;
  /** Teto do orçamento, por mais longa que a sequência fique. */
  faltasMaximas: number;
}

/**
 * Dia: uma falta liberada e mais uma a cada semana ativa, no máximo duas.
 *
 * A constante mora aqui, num lugar só, porque o streak é **derivado**: mudar estes números
 * reescreve o histórico de todo mundo de uma vez, em silêncio. Um segundo lugar com números
 * diferentes seria um bug impossível de perceber olhando a tela.
 */
export const TOLERANCIA_DIARIA: StreakTolerance = {
  faltasIniciais: 1,
  ganhaACada: 7,
  faltasMaximas: 2,
};

/** Semana: falta de semana pesa mais, então o orçamento demora mais a se renovar. */
export const TOLERANCIA_SEMANAL: StreakTolerance = {
  faltasIniciais: 1,
  ganhaACada: 4,
  faltasMaximas: 2,
};

/**
 * Teto da janela varrida. Existe porque a consulta precisa de um começo, não porque a sequência
 * deva parar aí — quem encosta no teto recebe `janelaEsgotada: true` e a tela mostra "365+".
 *
 * O valor subiu de 60 dias / 12 semanas junto com a tolerância: com faltas toleradas as
 * sequências passam a viver muito mais, e o teto viraria o limitador de fato justamente para o
 * usuário mais engajado — que é quem a issue quer premiar. Como a varredura virou **uma** query
 * agregada por domínio, ampliar a janela custa praticamente nada.
 */
export const JANELA_DIAS = 365;
export const JANELA_SEMANAS = 53;

export interface StreakResult {
  /** Tamanho da sequência, contando as faltas toleradas que ficaram no meio dela. */
  periodos: number;
  /** Quantas faltas foram efetivamente consumidas dentro da sequência. */
  faltasUsadas: number;
  /** Quantas o orçamento permite no tamanho atual. `faltasUsadas` nunca passa disto. */
  faltasPermitidas: number;
  /** O período corrente ainda não tem registro, mas ele não acabou — não conta como falta. */
  periodoCorrenteEmAberto: boolean;
  /** A varredura chegou ao fim da janela sem quebrar: a sequência real pode ser maior. */
  janelaEsgotada: boolean;
}

const VAZIO: StreakResult = {
  periodos: 0,
  faltasUsadas: 0,
  faltasPermitidas: 0,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
};

function orcamento(ativos: number, t: StreakTolerance): number {
  return Math.min(t.faltasMaximas, t.faltasIniciais + Math.floor(ativos / t.ganhaACada));
}

export interface ComputeStreakOptions {
  /** Chaves (`YYYY-MM-DD`) dos períodos com atividade, no fuso do usuário. */
  ativos: ReadonlySet<string>;
  /** Chave do período corrente — o dia (ou a semana) de hoje no fuso do usuário. */
  corrente: string;
  /** Anda um período para trás. Dia: `-1`. Semana: `-7`. */
  anterior: (chave: string) => string;
  /** Quantos períodos varrer para trás, incluindo o corrente. */
  janela: number;
  tolerancia: StreakTolerance;
}

export function computeStreak({
  ativos,
  corrente,
  anterior,
  janela,
  tolerancia,
}: ComputeStreakOptions): StreakResult {
  if (janela <= 0) return VAZIO;

  let chave = corrente;
  let indiceUltimoAtivo = -1;
  let indicePrimeiroAtivo = -1;
  let ativosVistos = 0;
  let faltasConsecutivas = 0;
  let faltasGastas = 0;
  // Só as faltas que a sequência de fato pagou. A varredura anda para trás, então uma falta só
  // se confirma como "dentro da sequência" quando ainda aparece um período ativo mais antigo
  // depois dela: as faltas do fim do laço são o que QUEBROU a sequência anterior, não custo desta.
  let faltasDentro = 0;
  let percorreuTudo = true;

  for (let i = 0; i < janela; i++) {
    if (i > 0) chave = anterior(chave);

    if (ativos.has(chave)) {
      faltasConsecutivas = 0;
      ativosVistos++;
      faltasDentro = faltasGastas;
      if (indiceUltimoAtivo === -1) indiceUltimoAtivo = i;
      indicePrimeiroAtivo = i;
      continue;
    }

    // O período corrente ainda está acontecendo: não ter registro nele não é falta, é cedo.
    // Sem esta linha o streak de quem ainda não almoçou apareceria quebrado toda manhã.
    if (i === 0) continue;

    faltasConsecutivas++;
    if (faltasConsecutivas >= 2) {
      percorreuTudo = false;
      break;
    }
    if (faltasGastas + 1 > orcamento(ativosVistos, tolerancia)) {
      percorreuTudo = false;
      break;
    }
    faltasGastas++;
  }

  if (indicePrimeiroAtivo === -1) return VAZIO;

  // O tamanho é o intervalo entre o ativo mais antigo e o mais recente: quem faltou ontem e ainda
  // não registrou hoje está no 7º dia, não no 8º.
  const periodos = indicePrimeiroAtivo - indiceUltimoAtivo + 1;

  return {
    periodos,
    // NÃO é `periodos - ativosVistos`: aquilo contava só as faltas ENTRE o primeiro e o último
    // ativo e ignorava a falta gasta depois do último — a de ontem, para quem ainda não registrou
    // hoje. O card dizia "0 de 2 faltas usadas" com uma já consumida e a sequência a um dia vazio
    // de quebrar por duas seguidas, prometendo uma folga que não existe.
    faltasUsadas: faltasDentro,
    faltasPermitidas: orcamento(ativosVistos, tolerancia),
    periodoCorrenteEmAberto: indiceUltimoAtivo > 0,
    janelaEsgotada: percorreuTudo && indicePrimeiroAtivo === janela - 1,
  };
}
