import { All, BadRequestException, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { HEADER_SUPERFICIE, superficieDoHeader } from './intent/superficie';
import { ConfigService } from '@nestjs/config';
import { HEADER_DO_AGENTE, ehOAgente } from './agente';

@UseGuards(McpThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('mcp')
export class McpController {
  constructor(
    private readonly registry: McpToolRegistry,
    private readonly config: ConfigService,
  ) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response, @CurrentUser() user: CurrentUserPayload) {
    // Antes de abrir o servidor: um header inválido é 400 com corpo legível, e não um erro
    // de protocolo no meio do JSON-RPC.
    const superficie = superficieDoHeader(req.headers[HEADER_SUPERFICIE]);
    if (superficie === 'intencao' && !this.registry.intencaoHabilitada()) {
      throw new BadRequestException(
        `${HEADER_SUPERFICIE}: intencao exige MCP_SUPERFICIE_INTENCAO ligada nesta instância.`,
      );
    }
    const server = new McpServer(
      { name: 'fatia-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    const agente = ehOAgente(
      req.headers[HEADER_DO_AGENTE],
      this.config.get<string>('AGENT_API_KEY', ''),
    );
    this.registry.bindAll(server, { userId: user.id, timezone: user.timezone }, superficie, {
      agente,
    });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
