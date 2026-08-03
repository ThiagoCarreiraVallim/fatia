import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AccessAuditService } from './access-audit.service';
import { ConsentService } from './consent.service';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { ProfessionalAccessService } from './professional-access.service';
import { ProfessionalLinkService } from './professional-link.service';
import { ConsentController } from './consent.controller';
import { SharingController } from './sharing.controller';
import { GroupRoleGuard } from './guards/group-role.guard';
import { GrantDataSharingTool } from './mcp/grant-data-sharing.tool';
import { JoinGroupTool } from './mcp/join-group.tool';
import { LeaveGroupTool } from './mcp/leave-group.tool';
import { ListDataAccessLogTool } from './mcp/list-data-access-log.tool';
import { ListDataSharingTool } from './mcp/list-data-sharing.tool';
import { ListMyGroupsTool } from './mcp/list-my-groups.tool';
import { RevokeDataSharingTool } from './mcp/revoke-data-sharing.tool';

/**
 * Toda a lógica de grupo e vínculo profissional do produto (ADR 014).
 *
 * A #153 entregou o modelo e as invariantes; a #154 acrescenta o ciclo de vida
 * do grupo (criar, pedir entrada, aprovar, sair, remover) e a revogação em
 * massa que faz a saída de fato encerrar a leitura; a #155 torna o
 * consentimento operável (conceder, ver, revogar, ler a trilha) e a #156
 * publica a matriz de papéis com guarda de rota. Painel é #157.
 *
 * **Papel e consentimento são duas camadas, e ficam separadas de propósito**
 * (#156): `GroupRoleGuard` + `permissions.ts` governam administração de grupo;
 * `ProfessionalLink` + `ProfessionalAccessService` governam leitura de dado de
 * saúde. Fundi-los obrigaria toda rota de domínio a saber que grupo existe.
 *
 * As tools MCP daqui são só as do lado do **aluno**. Criar grupo, aprovar
 * entrada e remover membro ficam em REST — painel de dono é superfície B2B,
 * não é o app do usuário.
 *
 * Os módulos de domínio **não** importam este módulo. A dependência corre no
 * outro sentido: quem lê em nome de outro chama `assertReadable`, recebe um
 * `userId`, e daí em diante usa os services de domínio como qualquer dono usa.
 */
@Module({
  imports: [CommonModule],
  controllers: [SharingController, ConsentController],
  providers: [
    ProfessionalAccessService,
    ProfessionalLinkService,
    AccessAuditService,
    ConsentService,
    GroupService,
    MembershipService,
    GroupRoleGuard,
    ListMyGroupsTool,
    JoinGroupTool,
    LeaveGroupTool,
    ListDataSharingTool,
    GrantDataSharingTool,
    RevokeDataSharingTool,
    ListDataAccessLogTool,
  ],
  exports: [
    ProfessionalAccessService,
    ProfessionalLinkService,
    ConsentService,
    GroupService,
    MembershipService,
  ],
})
export class SharingModule {}
