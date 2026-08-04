import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Cota de IA hospedada (issue #135).
 *
 * A decisão é tomada **antes** de chamar o agente, e por quem tem o banco — a API. O agente não tem
 * credencial de Postgres (ADR 015) e é disparado com o token do próprio usuário; se ele reportasse
 * o próprio consumo, o limite dependeria de o reportador ser honesto. Quem mede é quem cobra.
 *
 * A cota **degrada, não vende**. O app é grátis para o aluno (#158, cobrança por cabeça): estourar
 * o limite devolve o usuário ao registro manual, que continua funcionando inteiro. Em nenhuma
 * hipótese isso vira oferta de pagamento.
 */

/** Onde o teto bateu. Muda a mensagem e muda quem precisa agir. */
export type AiQuotaScope = 'user' | 'global' | 'unpriced';

export type AiQuotaLimits = {
  /** Teto diário de um usuário, em micro-unidades. `0` desliga a cota por usuário. */
  userDailyMicros: number;
  /**
   * Teto diário da instância inteira. Cota por usuário não protege contra mil usuários novos no
   * mesmo dia — o caso em que o orçamento acaba sem ninguém individualmente abusar.
   */
  globalDailyMicros: number;
  /**
   * Quantas chamadas de custo **desconhecido** a janela tolera antes de a cota fechar.
   *
   * `0` aqui **não** desliga nada, ao contrário dos dois de cima: significa "nenhuma tolerância".
   * A assimetria é deliberada e é o ponto do campo — um `0` que desligasse a guarda reproduziria
   * exatamente o buraco que ela existe para fechar.
   */
  unpricedDailyCalls: number;
};

export type AiQuotaSpend = {
  userMicros: number;
  globalMicros: number;
  /**
   * Chamadas da janela que voltaram de `estimateAiCost` com `pricingKnown: false`.
   *
   * Sem este número, o sinal do `pricingKnown` morre no banco. Trocar `AI_MODEL_VISION` no painel
   * sem mexer na `AI_PRICE_TABLE` faz toda chamada estimar `costMicros: 0`; a `SUM` da janela fica
   * em `0`; e a decisão devolve `allowed: true` para sempre, com `AI_QUOTA_DAILY_MICROS`
   * preenchido e correto. Ou seja: a contenção de custo se desligaria sozinha e em silêncio
   * **precisamente** quando se perdeu a capacidade de medir, e o alerta de anomalia chegaria
   * depois da fatura — que é o que a #135 diz querer evitar.
   */
  unpricedCalls: number;
};

export type AiQuotaDecision =
  | { allowed: true }
  | {
      allowed: false;
      scope: 'user' | 'global';
      spentMicros: number;
      limitMicros: number;
      resetsAt: Date;
    }
  | {
      allowed: false;
      scope: 'unpriced';
      /** Contagem, não dinheiro. Por isso não reaproveita `spentMicros`: a unidade é outra. */
      unpricedCalls: number;
      limitCalls: number;
      resetsAt: Date;
    };

/**
 * Janela da cota: **dia corrido em UTC**, não as últimas 24 h e não o fuso do usuário.
 *
 * Duas escolhas, cada uma descartando uma alternativa plausível.
 *
 * **UTC, e não `User.timezone`.** O fuso do usuário é editável por ele. Bastaria mudar de fuso para
 * reabrir a cota — e o teto global viraria a soma de janelas que não coincidem, ou seja, não
 * somaria.
 *
 * **Dia corrido, e não janela deslizante de 24 h.** A deslizante é mais justa, mas não sabe
 * responder *quando volta*: isso dependeria de qual chamada antiga sai da janela primeiro, o que a
 * soma não carrega. E "quando volta" não é enfeite — sem essa frase o sintoma que chega ao suporte
 * é "o app parou de reconhecer foto", que é o risco que a issue nomeia. O preço aceito é que quem
 * gasta tudo às 23h UTC ganha cota nova em uma hora.
 */
export function utcQuotaWindow(now: Date): { start: Date; resetsAt: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const resetsAt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, resetsAt };
}

/**
 * Decide se a chamada pode acontecer. Não faz I/O: recebe o gasto já somado.
 *
 * O teto é comparado com `>=` porque `spent` é o gasto **antes** desta chamada — quem já está
 * exatamente no limite não tem orçamento para a próxima. Com `>`, o limite seria sempre
 * ultrapassado por uma chamada, e uma chamada de visão não é barata.
 */
export function decideAiQuota(
  spend: AiQuotaSpend,
  limits: AiQuotaLimits,
  now: Date,
): AiQuotaDecision {
  const { resetsAt } = utcQuotaWindow(now);

  // Antes dos dois tetos de dinheiro, e não depois: eles comparam contra uma `SUM` que sabidamente
  // não conta essas chamadas. Deixar para o fim seria decidir com o número errado e só depois
  // reparar que ele estava errado.
  //
  // Só vale quando existe alguma cota de dinheiro ligada. Sem nenhuma, não há medição a proteger —
  // e a instância auto-hospedada com modelo local, que roda com a `AI_PRICE_TABLE` vazia de
  // propósito, nasceria com a IA barrada por uma cota que ela desligou.
  //
  // `unpricedCalls > 0` na frente do teto para que `unpricedDailyCalls: 0` signifique "nenhuma
  // tolerância" e não "barre sempre": sem esta cláusula, `0 >= 0` fecharia a IA de uma instância
  // cuja medição está perfeita.
  const quotaAtiva = limits.globalDailyMicros > 0 || limits.userDailyMicros > 0;
  if (quotaAtiva && spend.unpricedCalls > 0 && spend.unpricedCalls >= limits.unpricedDailyCalls) {
    return {
      allowed: false,
      scope: 'unpriced',
      unpricedCalls: spend.unpricedCalls,
      limitCalls: limits.unpricedDailyCalls,
      resetsAt,
    };
  }

  // O teto global é avaliado primeiro: quando os dois estouram, o que importa dizer é o que o
  // usuário não resolve sozinho.
  if (limits.globalDailyMicros > 0 && spend.globalMicros >= limits.globalDailyMicros) {
    return {
      allowed: false,
      scope: 'global',
      spentMicros: spend.globalMicros,
      limitMicros: limits.globalDailyMicros,
      resetsAt,
    };
  }

  if (limits.userDailyMicros > 0 && spend.userMicros >= limits.userDailyMicros) {
    return {
      allowed: false,
      scope: 'user',
      spentMicros: spend.userMicros,
      limitMicros: limits.userDailyMicros,
      resetsAt,
    };
  }

  return { allowed: true };
}

/**
 * 429 com erro nomeado. O cliente traduz em "registre manualmente por enquanto".
 *
 * A mensagem diz o que aconteceu **e quando volta**. Um 429 genérico faria a degradação chegar ao
 * usuário como defeito — e ele procuraria o problema na câmera dele.
 */
export class AiQuotaExceededException extends HttpException {
  constructor(readonly decision: Extract<AiQuotaDecision, { allowed: false }>) {
    super(
      {
        code: 'AI_QUOTA_EXCEEDED',
        scope: decision.scope,
        resetsAt: decision.resetsAt.toISOString(),
        message: quotaMessage(decision),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * O texto que o usuário lê. Um por escopo, porque quem precisa agir é diferente em cada um.
 *
 * O escopo `unpriced` é um problema de operação, não do usuário: para ele o efeito é o mesmo do
 * teto global, e é isso que a mensagem diz. Quem opera vê `scope` na resposta e no log, e é ali que
 * está a diferença — descrever "a tabela de preço está desatualizada" para o aluno seria vazar
 * detalhe de infraestrutura em troca de nenhuma ação possível do lado dele.
 */
function quotaMessage(decision: Extract<AiQuotaDecision, { allowed: false }>): string {
  const volta = `${decision.resetsAt.toISOString()} (UTC)`;
  if (decision.scope === 'user') {
    return (
      'Você atingiu o limite diário de uso da IA do Fatia. O registro manual continua ' +
      `disponível normalmente, e a IA volta em ${volta}.`
    );
  }
  return (
    'A IA do Fatia atingiu o limite diário da instância e está indisponível para todos ' +
    `no momento. O registro manual continua funcionando; a IA volta em ${volta}.`
  );
}

/** Aplica a cota, lançando quando estourou. É o ponto que #139/#141 chamam antes do agente. */
export function assertAiQuota(spend: AiQuotaSpend, limits: AiQuotaLimits, now: Date): void {
  const decision = decideAiQuota(spend, limits, now);
  if (!decision.allowed) throw new AiQuotaExceededException(decision);
}
