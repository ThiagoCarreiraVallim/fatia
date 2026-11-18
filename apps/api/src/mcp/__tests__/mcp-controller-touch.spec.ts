import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { McpConnectionService } from '../../auth/mcp-connection.service';
import { McpController } from '../mcp.controller';
import type { McpToolRegistry } from '../mcp-tool.registry';

/**
 * O `/mcp` marca o último acesso da conexão que chamou (#388), para a tela
 * "Conectar sua IA" mostrar "último acesso agora" depois da pergunta de teste.
 * O servidor MCP em si é trocado por um falso: aqui só importa o toque.
 */

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const registry = {
  intencaoHabilitada: () => false,
  bindAll: jest.fn(),
} as unknown as McpToolRegistry;

const res = { on: jest.fn() } as unknown as Response;
const user = { id: 'user-a', email: 'a@test.local', role: 'USER' as const, timezone: 'UTC' };

describe('McpController: último acesso', () => {
  it('toca a conexão pelo Bearer de quem chamou', async () => {
    const connections = { touch: jest.fn().mockResolvedValue(undefined) };
    const controller = new McpController(
      registry,
      connections as unknown as McpConnectionService,
      new ConfigService({}),
    );
    const req = { headers: { authorization: 'Bearer token-do-claude' }, body: {} } as Request;

    await controller.handle(req, res, user);

    expect(connections.touch).toHaveBeenCalledWith('token-do-claude');
  });

  it('a falha do toque não derruba a chamada da ferramenta', async () => {
    const connections = { touch: jest.fn().mockRejectedValue(new Error('banco fora')) };
    const controller = new McpController(
      registry,
      connections as unknown as McpConnectionService,
      new ConfigService({}),
    );
    const req = { headers: { authorization: 'Bearer x' }, body: {} } as Request;

    await expect(controller.handle(req, res, user)).resolves.toBeUndefined();
  });
});
