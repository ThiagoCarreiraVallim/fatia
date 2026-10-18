import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AiPaidBy } from '@prisma/client';
import type { AiEntitlement } from '../billing/ai-entitlement';

// Reexportados para quem fica do lado do aluno (`nutrition/`, `chat/`) falar do
// direito à IA sem importar `billing/` — ver `no-billing-in-student-surface`.
export { INSTANCIA_LIBERADA, type AiEntitlement } from '../billing/ai-entitlement';
export { AiEntitlements } from '../billing/subscription-entitlements.service';
import { AiEntitlements } from '../billing/subscription-entitlements.service';
import { AiUsageService } from './ai-usage.service';

/**
 * 402 com erro nomeado (ADR 024): a IA hospedada é do plano PRO.
 *
 * 402 e não 403: não é falta de permissão sobre um recurso, é a função que
 * pede plano, e o cliente usa o código para abrir "Meu plano" em vez de mostrar
 * erro. A mensagem lembra o caminho que continua livre: registrar à mão e usar
 * a própria IA pelo MCP.
 */
export class AiPlanRequiredException extends HttpException {
  constructor(readonly direito: AiEntitlement) {
    super(
      {
        code: 'AI_PLAN_REQUIRED',
        reason: direito.motivo,
        message: direito.degraded
          ? 'Seu plano PRO não está ativo agora. O registro manual continua normal; ' +
            'regularize em "Meu plano" para voltar a usar a IA do Fatia.'
          : 'A IA do Fatia (chat, ditado e foto) faz parte do plano PRO. O registro manual ' +
            'e a sua própria IA pelo MCP continuam livres no plano Free.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Quem paga uma chamada à IA hospedada. */
export interface Pagador {
  paidBy: AiPaidBy;
  groupId: string | null;
}

/** Disponibilidade como a tela mostra: `allowed` diz se esta pessoa pode usar. */
export type MotivoDaIa = 'ok' | 'plan_required' | 'not_configured';

/**
 * O portão único da IA hospedada: **plano antes de cota**.
 *
 * Fica em `ai/`, e não em `billing/`, para que `nutrition/` e `chat/` dependam
 * da regra "pode usar a IA?" sem importar nada de cobrança — o
 * `no-billing-in-student-surface.spec.ts` continua valendo para eles.
 *
 * A ordem importa: quem é Free recebe 402 e nunca chega a gastar cota nem a
 * chamar o agente; quem é PRO ainda passa pela cota diária, que protege a
 * margem ("o plano protege o acesso, a cota protege a margem").
 */
@Injectable()
export class AiAccessService {
  constructor(
    private readonly direitos: AiEntitlements,
    private readonly uso: AiUsageService,
  ) {}

  async assertPodeUsar(userId: string, agora: Date = new Date()): Promise<AiEntitlement> {
    const direito = await this.direitos.aiTierForUser(userId, agora);
    if (direito.tier !== 'PRO') throw new AiPlanRequiredException(direito);
    await this.uso.assertDentroDaCota(userId, agora);
    return direito;
  }

  /** `allowed` sem lançar, para `/availability`. `disponivel` = a instância tem a função. */
  async motivo(
    userId: string,
    disponivel: boolean,
  ): Promise<{ allowed: boolean; reason: MotivoDaIa }> {
    if (!disponivel) return { allowed: false, reason: 'not_configured' };
    const direito = await this.direitos.aiTierForUser(userId);
    return direito.tier === 'PRO'
      ? { allowed: true, reason: 'ok' }
      : { allowed: false, reason: 'plan_required' };
  }

  /**
   * A comunidade que paga o assento de IA desta pessoa, ou `null`. É o agente
   * padrão do chat (Fase 7c): quem entrou pela academia conversa com o dela.
   */
  async seatGroupOf(userId: string): Promise<string | null> {
    return AiAccessService.pagoPor(await this.direitos.aiTierForUser(userId)).groupId;
  }

  /**
   * Quem paga, para `AiUsage.paidBy` e `AiUsage.groupId`. Com assento, a
   * comunidade — e o uso entra na conta dela (ADR 025).
   */
  static pagoPor(direito: AiEntitlement): Pagador {
    if (direito.source === 'INSTANCE') return { paidBy: 'INSTANCE', groupId: null };
    if (direito.tier !== 'PRO') return { paidBy: 'FREE', groupId: null };
    if (direito.source === 'GROUP') {
      return { paidBy: 'GROUP', groupId: direito.subscription?.group?.id ?? null };
    }
    return { paidBy: 'USER', groupId: null };
  }
}
