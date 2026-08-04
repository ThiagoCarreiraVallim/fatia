import { z } from 'zod';

/**
 * Custo de uma chamada de IA hospedada (issue #135).
 *
 * A issue não é relatório, é contenção de custo: a #158 fechou cobrança **por cabeça**, então um
 * aluno de uso pesado não tem para onde ser repassado. Medir é o que permite a cota, e a cota é a
 * única defesa de margem que sobrou.
 *
 * Vale só para a inferência que a Fatia paga. Chamada que vem do Claude do próprio usuário pelo
 * `/mcp` não passa por aqui **por construção** — é o modelo dele executando, custo zero para o
 * projeto (ADR 018, e a decisão registrada na #165). Não há caminho a inferir nem rótulo a
 * atribuir: a fronteira é física.
 */

/**
 * Preço de um modelo, em **micro-unidades da moeda por milhão de unidades**.
 *
 * "Unidade" é token para texto e visão, e segundo de áudio para transcrição — o provedor decide, e
 * a tabela só multiplica.
 *
 * A escala importa e é fácil de errar por uma ordem de grandeza. Um modelo a US$ 3,00 por milhão
 * de tokens de entrada se escreve `"in": 3000000`, porque US$ 3,00 são 3.000.000 de micro-dólares.
 * Escrever `"in": 3` significaria US$ 0,000003 por milhão — e o sintoma seria um mês inteiro de
 * custo arredondado para zero, seguido de uma fatura real. Por isso `.env.example` carrega uma
 * linha correta com a conta feita, e não um valor de brincadeira.
 */
export const AiModelPriceSchema = z.object({
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
});

export type AiModelPrice = z.infer<typeof AiModelPriceSchema>;

export const AiPriceTableSchema = z.record(z.string().min(1), AiModelPriceSchema);

export type AiPriceTable = z.infer<typeof AiPriceTableSchema>;

export type AiCallUnits = {
  /** Tokens de entrada, ou segundos de áudio. `undefined` quando o provedor não devolveu `usage`. */
  inputUnits?: number;
  /**
   * Tokens de saída. **`0` explícito, e nunca `undefined`, quando a capacidade não tem saída
   * cobrada.**
   *
   * A distinção é do chamador porque só ele sabe qual é o caso, e errar aqui é silencioso. O
   * exemplo que vai acontecer é `/embeddings`: a resposta OpenAI-compatível traz `prompt_tokens` e
   * `total_tokens`, e **nunca** `completion_tokens`. Quem mapear o `usage` campo a campo passa
   * `outputUnits: undefined`, e aí todo embedding entra como preço desconhecido — com o modelo na
   * tabela, o preço certo e nada errado à vista.
   */
  outputUnits?: number;
};

export type AiCost = {
  /**
   * Micro-unidades da moeda. **Inteiro, nunca `Float`** — custo acumulado ao longo de milhares de
   * chamadas em ponto flutuante erra devagar, sempre para o mesmo lado, e ninguém percebe.
   */
  costMicros: number;
  /**
   * `false` quando o custo é 0 porque **não deu para saber**, e não porque a chamada foi grátis.
   *
   * Sem este campo os dois casos são a mesma linha no banco. Trocar de modelo no AI Gateway e
   * esquecer a tabela de preço produziria um mês de "custo zero" indistinguível de um mês de
   * modelo local — e a divergência só apareceria na fatura. É esta coluna que o alerta de anomalia
   * olha.
   */
  pricingKnown: boolean;
};

/**
 * Lê `AI_PRICE_TABLE` do ambiente. Lança quando o JSON é inválido.
 *
 * Chamada pelo schema de env (`env.validation.ts`), de propósito: JSON escrito à mão em variável de
 * ambiente é fácil de quebrar, e o momento de descobrir isso é o boot, não a primeira chamada de
 * IA — que acontece longe, em produção, e no meio de uma requisição de usuário.
 */
export function parseAiPriceTable(raw: string): AiPriceTable {
  if (!raw.trim()) return {};

  // O `throw` fica fora do `catch` de propósito: o alvo do ES2021 deste pacote não tem a opção
  // `cause` do `Error`, então re-lançar de dentro do `catch` perderia o erro original em silêncio.
  // Aqui a mensagem do `JSON.parse` é carregada para fora e entra na mensagem final.
  const json = tryParseJson(raw);
  if (!json.ok) {
    throw new Error(
      `AI_PRICE_TABLE não é JSON válido (${json.error}). Formato esperado: ` +
        '{"modelo":{"in":3000000,"out":15000000}}, em micro-unidades por milhão de unidades.',
    );
  }

  const result = AiPriceTableSchema.safeParse(json.value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `AI_PRICE_TABLE tem forma inválida (${issues}). Cada modelo precisa de "in" e "out" ` +
        'inteiros não negativos, em micro-unidades por milhão de unidades.',
    );
  }
  return result.data;
}

/**
 * Custo estimado de uma chamada, a partir do modelo e das unidades que o provedor reportou.
 *
 * Três casos devolvem `pricingKnown: false`, e a diferença entre eles não muda a conta — muda o que
 * o alerta enxerga:
 *
 * 1. **Modelo fora da tabela.** Alguém trocou `AI_MODEL_*` no painel e não mexeu no preço.
 * 2. **`usage` ausente na resposta.** Acontece de verdade em streaming, e é o modo de falha mais
 *    traiçoeiro: tratar unidade ausente como zero faz a chamada mais cara do dia entrar como
 *    grátis, sem erro nenhum.
 * 3. **Modelo local.** Preço 0 declarado na tabela é `pricingKnown: true` e custo 0 — isso é
 *    correto, não é buraco. O que não pode é *ausência* de preço virar gratuidade.
 */
export function estimateAiCost(model: string, units: AiCallUnits, table: AiPriceTable): AiCost {
  const price = table[model];
  const { inputUnits, outputUnits } = units;

  if (price === undefined) return { costMicros: 0, pricingKnown: false };
  if (!isCountable(inputUnits) || !isCountable(outputUnits)) {
    return { costMicros: 0, pricingKnown: false };
  }

  // Arredonda uma vez, no fim. Arredondar entrada e saída em separado descarta duas frações por
  // chamada em vez de uma — e sempre na mesma direção, o que vira subnotificação sistemática.
  const totalPerMillion = inputUnits * price.in + outputUnits * price.out;
  return { costMicros: Math.round(totalPerMillion / 1_000_000), pricingKnown: true };
}

type JsonResult = { ok: true; value: unknown } | { ok: false; error: string };

function tryParseJson(raw: string): JsonResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Unidade utilizável: presente, finita e não negativa. **Fração é válida.**
 *
 * Exigir inteiro parecia mais seguro e era um bug: a unidade documentada em `AiCallUnits` inclui
 * **segundo de áudio**, e um provedor de transcrição reporta duração fracionária. Com
 * `Number.isInteger`, toda chamada da #141 cairia em `pricingKnown: false` — ou seja, a medição de
 * áudio nasceria desligada, acendendo o alerta de anomalia com fatura real do outro lado, e
 * fechando a cota pelo teto de chamadas sem preço.
 *
 * O que a checagem continua recusando é o que é dado corrompido de verdade: `undefined`, `NaN`,
 * `±Infinity` e negativo. `NaN` é o pior deles — propagado como número viraria `costMicros: NaN` e
 * envenenaria toda soma posterior, inclusive a da cota, que passaria a nunca estourar.
 *
 * O arredondamento é único e no fim (ver `estimateAiCost`), então a fração não vira imprecisão
 * acumulada: ela é somada com a do outro lado e só depois vira inteiro.
 */
function isCountable(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}
