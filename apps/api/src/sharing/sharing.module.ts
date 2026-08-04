import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GoalsModule } from '../goals/goals.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { ProgressModule } from '../progress/progress.module';
import { WorkoutModule } from '../workout/workout.module';
import { AccessAuditService } from './access-audit.service';
import { ConsentService } from './consent.service';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { ProfessionalAccessService } from './professional-access.service';
import { ProfessionalLinkService } from './professional-link.service';
import { StudentViewService } from './student-view.service';
import { ConsentController } from './consent.controller';
import { ProfessionalController } from './professional.controller';
import { SharingController } from './sharing.controller';
import { GroupRoleGuard } from './guards/group-role.guard';
import { GetStudentProgressTool } from './mcp/get-student-progress.tool';
import { GrantDataSharingTool } from './mcp/grant-data-sharing.tool';
import { JoinGroupTool } from './mcp/join-group.tool';
import { LeaveGroupTool } from './mcp/leave-group.tool';
import { ListDataAccessLogTool } from './mcp/list-data-access-log.tool';
import { ListDataSharingTool } from './mcp/list-data-sharing.tool';
import { ListMyGroupsTool } from './mcp/list-my-groups.tool';
import { ListMyStudentsTool } from './mcp/list-my-students.tool';
import { RevokeDataSharingTool } from './mcp/revoke-data-sharing.tool';

/**
 * Toda a lógica de grupo e vínculo profissional do produto (ADR 014).
 *
 * A #153 entregou o modelo e as invariantes; a #154 acrescenta o ciclo de vida
 * do grupo (criar, pedir entrada, aprovar, sair, remover) e a revogação em
 * massa que faz a saída de fato encerrar a leitura; a #155 torna o
 * consentimento operável (conceder, ver, revogar, ler a trilha) e a #156
 * publica a matriz de papéis com guarda de rota; a #157 põe o painel do
 * profissional em pé — e ele é **só leitura**, porque a direção
 * profissional → aluno da ADR 014 é oferta + aceite, não escrita em nome de
 * outro.
 *
 * **Papel e consentimento são duas camadas, e ficam separadas de propósito**
 * (#156): `GroupRoleGuard` + `permissions.ts` governam administração de grupo;
 * `ProfessionalLink` + `ProfessionalAccessService` governam leitura de dado de
 * saúde. Fundi-los obrigaria toda rota de domínio a saber que grupo existe.
 *
 * As tools MCP daqui são as do lado do **aluno**, mais as duas do painel do
 * profissional (#157). Criar grupo, aprovar entrada e remover membro ficam em
 * REST — painel de dono é superfície B2B, não é o app do usuário.
 *
 * Os módulos de domínio **não** importam este módulo. A dependência corre no
 * outro sentido, e é por isso que os módulos de domínio aparecem em `imports`
 * aqui: quem lê em nome de outro chama `assertReadable`, recebe um `userId`, e
 * daí em diante usa os services de domínio como qualquer dono usa. Nenhum deles
 * mudou uma linha para isso acontecer.
 */
@Module({
  imports: [CommonModule, WorkoutModule, ProgressModule, NutritionModule, GoalsModule],
  controllers: [SharingController, ConsentController, ProfessionalController],
  providers: [
    ProfessionalAccessService,
    ProfessionalLinkService,
    StudentViewService,
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
    ListMyStudentsTool,
    GetStudentProgressTool,
  ],
  exports: [
    ProfessionalAccessService,
    ProfessionalLinkService,
    ConsentService,
    GroupService,
    MembershipService,
    StudentViewService,
  ],
})
export class SharingModule {}
