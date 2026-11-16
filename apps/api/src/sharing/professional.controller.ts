import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConsentGoverned, SelfOnly } from './decorators/require-group-action.decorator';
import { GroupRoleGuard } from './guards/group-role.guard';
import { DIAS_PADRAO, StudentReadQueryDto } from './dto/student-view.dto';
import { StudentViewService } from './student-view.service';
import { SendPlanOfferDto } from './dto/plan-offer.dto';
import { PlanOfferService } from './plan-offer.service';

/**
 * Painel do personal trainer e do nutricionista (#157).
 *
 * **Só leitura, e só do consentido.** O texto original da issue falava em o
 * profissional montar e editar o plano *na conta do aluno*; a ADR 014 decidiu
 * o contrário, e é ela que vale: o profissional monta na conta **dele**,
 * oferece, e o aceite do aluno materializa uma cópia sob o `userId` do aluno.
 * A única escrita é a oferta de plano (#379), que não escreve na conta do
 * aluno: ela espera o aceite dele. Não existe "ação em nome de aluno".
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
  constructor(
    private readonly students: StudentViewService,
    private readonly offers: PlanOfferService,
  ) {}

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

  /**
   * Envia um plano de treino da própria conta ao aluno (#379). É a porta
   * mínima; o editor e o painel da equipe são a #405 e a #406.
   *
   * Não é leitura, mas quem autoriza é o mesmo vínculo: só há oferta com
   * `ProfessionalLink` ativo entre o aluno e quem envia. Por isso
   * `@ConsentGoverned` e o titular pela associação, nunca por `userId`.
   */
  @Post('students/:membershipId/plan-offers')
  @ConsentGoverned()
  sendPlanOffer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: SendPlanOfferDto,
  ) {
    return this.offers.send(user.id, membershipId, dto);
  }

  /** Versão nova de uma oferta do mesmo aluno: nada muda para ele sem o aceite. */
  @Post('students/:membershipId/plan-offers/:offerId/versions')
  @ConsentGoverned()
  updatePlanOffer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: SendPlanOfferDto,
  ) {
    return this.offers.update(user.id, membershipId, offerId, dto);
  }
}
