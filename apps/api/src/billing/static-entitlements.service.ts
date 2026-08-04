import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingEntitlements } from './entitlements.port';

/**
 * Implementação por env, enquanto a cobrança (#158) não existe.
 *
 * `INSIGHTS_ADDON_GROUP_IDS` é uma lista de ids de grupo habilitados à mão —
 * cabe nos primeiros clientes e não cabe no décimo. A dívida é declarada: uma
 * lista manual **envelhece**, e um grupo que cancelar continua ligado até alguém
 * editar o env. A mitigação real é a #158.
 */
@Injectable()
export class StaticEntitlementsService extends BillingEntitlements {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async hasInsights(groupId: string): Promise<boolean> {
    const bruto = this.config.get<string>('INSIGHTS_ADDON_GROUP_IDS') ?? '';
    // `filter(Boolean)` porque `''.split(',')` devolve `['']`, e um grupo de id
    // vazio nunca existe — mas um `includes('')` frouxo poderia liberar tudo.
    const habilitados = bruto
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    return habilitados.includes(groupId);
  }
}
