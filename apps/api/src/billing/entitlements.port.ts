import { Injectable } from '@nestjs/common';

/**
 * A porta de direitos comerciais — o que desacopla o painel pago (#160) do motor
 * de cobrança (#158).
 *
 * O add-on de insights é **segunda linha de receita**: cobrado à parte da
 * assinatura por aluno, cancelável à parte. Quem sabe se o grupo pagou é a
 * cobrança; quem precisa da resposta é o painel. Sem esta porta, a #160 ficaria
 * bloqueada por uma issue inteira de billing para responder um booleano.
 *
 * Quando a #158 entrar, nasce uma segunda implementação lendo
 * `GroupSubscription.insightsAddOn`, troca-se o `provide` no módulo, e nenhum
 * arquivo do painel é tocado.
 */
@Injectable()
export abstract class BillingEntitlements {
  /**
   * Este grupo tem o add-on de insights, agora?
   *
   * **Nunca lança.** Um erro de cobrança que virasse exceção transformaria uma
   * indisponibilidade de billing em erro no painel; e, pior, um `catch` genérico
   * a jusante poderia interpretá-lo como "deixa passar". Falha responde `false`.
   */
  abstract hasInsights(groupId: string): Promise<boolean>;
}
