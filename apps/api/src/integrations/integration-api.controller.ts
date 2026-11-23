import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyService } from './api-key.service';
import { IntegrationReadService } from './integration-read.service';

@Controller('integrations/v1')
@Public()
export class IntegrationApiController {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly read: IntegrationReadService,
  ) {}

  @Get('members')
  members(@Req() req: Request, @Query() q: Record<string, string>) {
    void req;
    void q;
    void this.keys;
    void this.read;
    return { items: [] };
  }
}
