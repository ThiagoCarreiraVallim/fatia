import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { McpTokenService } from './mcp-token.service';

class CreateTokenDto {
  @IsString()
  @MaxLength(80)
  label!: string;
}

@Controller('mcp-tokens')
export class McpTokensController {
  constructor(private readonly tokens: McpTokenService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.tokens.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateTokenDto) {
    return this.tokens.create(user.id, dto.label);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.tokens.revoke(user.id, id);
  }
}
