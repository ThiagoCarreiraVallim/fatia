import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConsentService } from './consent.service';
import { AccessLogQueryDto, GrantConsentDto } from './dto/consent.dto';
import { SelfOnly } from './decorators/require-group-action.decorator';

/**
 * O painel de consentimento do **titular** (#155).
 *
 * Toda rota daqui é `@SelfOnly`: quem consente é o dono do dado, sempre, e o
 * `subjectUserId` sai do token. Não há papel de grupo que autorize consentir por
 * outra pessoa — nem o dono da academia — e por isso nenhuma rota deste arquivo
 * carrega `:groupId`, que é o que o `GroupRoleGuard` precisaria para conferir
 * papel. O grupo, quando existe, sai da associação do profissional.
 */
@Controller('sharing')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  /** "O que a academia consegue ver de mim?" — os vínculos vivos. */
  @Get('consents')
  @SelfOnly()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.consent.listMine(user.id);
  }

  /**
   * Concede ou substitui o consentimento a um profissional.
   *
   * Uma chamada por profissional, com a lista completa de escopos: **não existe
   * "compartilhar tudo"**. Um atalho que marcasse as cinco categorias de uma vez
   * recriaria o tudo-ou-nada que a issue existe para evitar.
   */
  @Post('consents')
  @SelfOnly()
  grant(@CurrentUser() user: CurrentUserPayload, @Body() dto: GrantConsentDto) {
    return this.consent.grant(user.id, dto.professionalMembershipId, dto.scopes);
  }

  /** Revoga. A linha sobrevive com `revokedAt` — é ela que responde "quem teve acesso". */
  @Delete('consents/:linkId')
  @SelfOnly()
  revoke(@CurrentUser() user: CurrentUserPayload, @Param('linkId') linkId: string) {
    return this.consent.revoke(user.id, linkId);
  }

  /** "Quem olhou meu dado, quando" — inclusive as tentativas negadas. */
  @Get('access-log')
  @SelfOnly()
  accessLog(@CurrentUser() user: CurrentUserPayload, @Query() q: AccessLogQueryDto) {
    return this.consent.listAccessLog(user.id, q.limit);
  }
}
