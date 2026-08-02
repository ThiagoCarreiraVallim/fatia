import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AccessAuditService } from './access-audit.service';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { ProfessionalAccessService } from './professional-access.service';
import { ProfessionalLinkService } from './professional-link.service';
import { SharingController } from './sharing.controller';
import { JoinGroupTool } from './mcp/join-group.tool';
import { LeaveGroupTool } from './mcp/leave-group.tool';
import { ListMyGroupsTool } from './mcp/list-my-groups.tool';

/**
 * Toda a lógica de grupo e vínculo profissional do produto (ADR 014).
 *
 * A #153 entregou o modelo e as invariantes; a #154 acrescenta o ciclo de vida
 * do grupo (criar, pedir entrada, aprovar, sair, remover) e a revogação em
 * massa que faz a saída de fato encerrar a leitura. Consentimento operável é
 * #155, matriz de papéis é #156, painel é #157.
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
  controllers: [SharingController],
  providers: [
    ProfessionalAccessService,
    ProfessionalLinkService,
    AccessAuditService,
    GroupService,
    MembershipService,
    ListMyGroupsTool,
    JoinGroupTool,
    LeaveGroupTool,
  ],
  exports: [ProfessionalAccessService, ProfessionalLinkService, GroupService, MembershipService],
})
export class SharingModule {}
