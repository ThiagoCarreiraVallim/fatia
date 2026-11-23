import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { KEY_CALLS_PER_MINUTE } from './api-key';
import { ApiKeyGuard, ApiKeyThrottlerGuard, type ApiKeyRequest } from './api-key.guard';
import { ApiKeyService, type ApiKeyContext } from './api-key.service';
import { InvitesQueryDto, PageQueryDto, SendsQueryDto } from './dto/integrations.dto';
import { IntegrationReadService, type PageQuery } from './integration-read.service';

function page(q: PageQueryDto): PageQuery {
  return {
    ...(q.since ? { since: new Date(q.since) } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
  };
}

function keyOf(req: ApiKeyRequest): ApiKeyContext {
  // O `ApiKeyGuard` roda antes e preenche; sem ele a rota nem abre.
  return req.apiKey!;
}

/**
 * A API das integrações (#413, Pn-38): o que o Zapier e o Make leem com a
 * chave da comunidade. Sem login do Fatia (`@Public()` para o guarda de JWT);
 * quem barra é o `ApiKeyGuard`, e o teto por minuto é por chave. Cada rota
 * cobra o escopo e a cota antes de ler. Nunca dado de saúde; nenhuma tool MCP
 * corresponde (a administração da comunidade fica fora do MCP).
 */
@Controller('integrations/v1')
@Public()
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: KEY_CALLS_PER_MINUTE } })
export class IntegrationApiController {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly read: IntegrationReadService,
  ) {}

  /** Para o "testar conexão" do Zapier e do Make: a comunidade e a cota. */
  @Get('me')
  async me(@Req() req: ApiKeyRequest) {
    const ctx = keyOf(req);
    await this.keys.consume(ctx, ctx.scopes[0]!, 'me');
    return { scopes: ctx.scopes, quota: await this.keys.quota(ctx.groupId) };
  }

  @Get('members')
  async members(@Req() req: ApiKeyRequest, @Query() q: PageQueryDto) {
    const ctx = keyOf(req);
    await this.keys.consume(ctx, 'MEMBERS', 'members');
    return this.read.members(ctx, page(q));
  }

  @Get('invites')
  async invites(@Req() req: ApiKeyRequest, @Query() q: InvitesQueryDto) {
    const ctx = keyOf(req);
    await this.keys.consume(ctx, 'INVITES', 'invites');
    return this.read.invites(ctx, { ...page(q), ...(q.pending ? { pending: true } : {}) });
  }

  @Get('sends')
  async sends(@Req() req: ApiKeyRequest, @Query() q: SendsQueryDto) {
    const ctx = keyOf(req);
    await this.keys.consume(ctx, 'SENDS', 'sends');
    return this.read.sends(ctx, { ...page(q), ...(q.kind ? { kind: q.kind } : {}) });
  }
}
