import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { McpToolRegistry } from './mcp-tool.registry';

@UseGuards(JwtAuthGuard, McpThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('mcp')
export class McpController {
  constructor(private readonly registry: McpToolRegistry) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response, @CurrentUser() user: CurrentUserPayload) {
    const server = new McpServer(
      { name: 'fatia-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.registry.bindAll(server, { userId: user.id, timezone: user.timezone });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
