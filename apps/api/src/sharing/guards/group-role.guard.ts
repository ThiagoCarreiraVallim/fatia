import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { can, type GroupAction } from '../permissions';
import { GROUP_ACTION_KEY } from '../decorators/require-group-action.decorator';

/** Mesma resposta para "grupo não existe" e "não sou membro dele" (#92). */
const NOT_FOUND = 'Group not found';

/**
 * Guarda de papel para rotas administrativas de grupo (#156).
 *
 * Roda **antes** do controller e confronta a associação de quem chamou com a
 * matriz de `permissions.ts`. Rota sem `@RequireGroupAction` passa direto: o
 * guarda não inventa exigência para rota que age sobre o próprio usuário — quem
 * garante que nenhuma rota ficou sem decorator é o teste estrutural, não uma
 * regra de "nega por padrão" que quebraria toda rota `@SelfOnly`.
 *
 * **Não substitui o `assertOwner` dos services.** As duas checagens ficam, e de
 * propósito: o guarda protege a rota HTTP, e o service continua protegido
 * quando chamado de outro lugar — de uma tool MCP, de um job, de outro service.
 * Trocar uma pela outra transformaria a segunda linha de defesa em nada.
 *
 * **E não confere consentimento.** Papel governa administração; leitura de dado
 * de saúde é `ProfessionalAccessService`, chamado explicitamente pelas poucas
 * leituras delegadas. Ver `docs/PERMISSIONS.md`.
 */
@Injectable()
export class GroupRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<GroupAction | undefined>(
      GROUP_ACTION_KEY,
      context.getHandler(),
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id?: string };
      params?: Record<string, string>;
    }>();

    const userId = request.user?.id;
    const groupId = request.params?.groupId;

    // Sem usuário no request o `JwtAuthGuard` não rodou, e sem `:groupId` a rota
    // foi anotada com uma ação que ela não tem como conferir. Nos dois casos a
    // falha é de montagem, e deixar passar seria abrir a rota justamente quando
    // o guarda perdeu a informação de que precisa.
    if (!userId || !groupId) {
      throw new ForbiddenException('Rota de grupo sem contexto para conferir o papel');
    }

    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });

    // Não-membro recebe `NOT_FOUND`: ele não pode descobrir que o grupo existe.
    // Membro comum recebe `FORBIDDEN`, porque para ele não há existência a
    // esconder — ele já está lá dentro. É a mesma distinção do `assertOwner`.
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException(NOT_FOUND);
    }

    if (!can(membership.role, action)) {
      throw new ForbiddenException('Seu papel neste grupo não permite esta ação');
    }

    return true;
  }
}
