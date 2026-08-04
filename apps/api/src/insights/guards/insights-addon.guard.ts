import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingEntitlements } from '../../billing/entitlements.port';

/**
 * Guarda do add-on pago (#160).
 *
 * Existe porque o modo de falha padrão desse tipo de recurso é o menu escondido
 * com o endpoint aberto: a UI deixa de mostrar o botão e a rota continua
 * respondendo para quem souber a URL.
 *
 * Responde `NOT_FOUND`, e não `402`: não vale confirmar que o painel existe para
 * quem não contratou — e a UI já sabe o que oferecer, sem precisar de um código
 * de status para descobrir.
 *
 * **Não substitui o `GroupRoleGuard`.** Este confere que o grupo comprou; aquele
 * confere que quem chamou é o dono. As duas rotas pagas levam os dois, e é a
 * combinação — dono de um grupo com add-on — que abre o painel.
 */
@Injectable()
export class InsightsAddonGuard implements CanActivate {
  constructor(private readonly entitlements: BillingEntitlements) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string> }>();
    const groupId = request.params?.groupId;

    // Sem `:groupId` a rota foi anotada com um guarda que ela não tem como
    // conferir. Falha de montagem: falha alto, em vez de abrir.
    if (!groupId) throw new ForbiddenException('Rota de add-on sem grupo para conferir');

    if (!(await this.entitlements.hasInsights(groupId))) {
      throw new NotFoundException('Group not found');
    }

    return true;
  }
}
