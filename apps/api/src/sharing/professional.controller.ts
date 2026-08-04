import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConsentGoverned, SelfOnly } from './decorators/require-group-action.decorator';
import { GroupRoleGuard } from './guards/group-role.guard';
import { DIAS_PADRAO, StudentReadQueryDto } from './dto/student-view.dto';
import { StudentViewService } from './student-view.service';

/**
 * Painel do personal trainer e do nutricionista (#157).
 *
 * **Só leitura, e só do consentido.** O texto original da issue falava em o
 * profissional montar e editar o plano *na conta do aluno*; a ADR 014 decidiu
 * o contrário, e é ela que vale: o profissional monta na conta **dele**,
 * oferece, e o aceite do aluno materializa uma cópia sob o `userId` do aluno.
 * Por isso não há um único verbo de escrita neste controller — não existe "ação
 * em nome de aluno" a auditar, existe leitura a auditar.
 *
 * **Nada de `:groupId` nas rotas.** O grupo sai da associação lida, junto com o
 * titular, dentro da porta única. Passá-lo por fora daria duas fontes para a
 * mesma verdade, e a divergência entre elas é exatamente o furo do #204.
 *
 * O `GroupRoleGuard` é registrado mesmo sem nenhuma rota `@RequireGroupAction`:
 * ele é inerte para rota não anotada, e o registro é o que faz uma rota
 * administrativa acrescentada aqui amanhã nascer protegida em vez de aberta.
 */
@Controller('professional')
@UseGuards(GroupRoleGuard)
export class ProfessionalController {
  constructor(private readonly students: StudentViewService) {}

  /**
   * Os alunos que eu atendo, com o que cada um me consentiu.
   *
   * `@SelfOnly` e não `@ConsentGoverned`: o alvo é quem chamou — são os grupos
   * *dele* — e não sai dado de saúde de ninguém, só composição de grupo.
   */
  @Get('students')
  @SelfOnly()
  listStudents(@CurrentUser() user: CurrentUserPayload) {
    return this.students.listStudents(user.id);
  }

  /**
   * Uma leitura de um aluno, num escopo, dentro de uma janela.
   *
   * Cada chamada grava uma linha em `ProfessionalAccessLog` — inclusive quando
   * é recusada, que é o registro que o aluno vê em `list_data_access_log`.
   */
  @Get('students/:membershipId/progress')
  @ConsentGoverned()
  read(
    @CurrentUser() user: CurrentUserPayload,
    @Param('membershipId') membershipId: string,
    @Query() query: StudentReadQueryDto,
  ) {
    return this.students.read(user.id, membershipId, query.scope, query.days ?? DIAS_PADRAO);
  }
}
