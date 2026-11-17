import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConfigService } from '@nestjs/config';
import type { McpAutoWriteRequest, McpToolDef } from '../../common/decorators/tool.decorator';
import { carregarTools, registryDeTeste } from './support/catalogo-servido';
import type { Request, Response } from 'express';
import { McpController } from '../mcp.controller';
import type { McpToolRegistry } from '../mcp-tool.registry';
import { autoWriteFromRequest, HEADER_AGENT_KEY, HEADER_AUTO_WRITE } from '../auto-write-header';

/**
 * O header da gravação automática só vale vindo do agente hospedado (#385): um cliente OAuth ou de
 * token de API que o mande, sem a credencial do agente, leva 403 — e nunca grava sem pausa.
 */
const CHAVE = 'segredo-do-agente';
const pedido = {
  conversationId: '6f9d2c1e-8a8b-4c4d-9e9f-0a1b2c3d4e5f',
  runId: 'token-do-turno',
  toolCallId: 'call-1',
};
const headers = (extra: Record<string, string> = {}) => ({
  [HEADER_AUTO_WRITE]: JSON.stringify(pedido),
  ...extra,
});

describe('autoWriteFromRequest', () => {
  it('sem o header é o caminho de sempre, com ou sem chave', () => {
    expect(autoWriteFromRequest({}, CHAVE)).toBeNull();
    expect(autoWriteFromRequest({}, '')).toBeNull();
  });

  it('com a chave do agente, devolve o pedido', () => {
    expect(autoWriteFromRequest(headers({ [HEADER_AGENT_KEY]: CHAVE }), CHAVE)).toEqual(pedido);
  });

  it('sem a credencial do agente é 403', () => {
    expect(() => autoWriteFromRequest(headers(), CHAVE)).toThrow(ForbiddenException);
  });

  it('com a credencial errada é 403', () => {
    expect(() => autoWriteFromRequest(headers({ [HEADER_AGENT_KEY]: 'outra' }), CHAVE)).toThrow(
      ForbiddenException,
    );
  });

  it('instância sem AGENT_API_KEY não aceita gravação automática de ninguém', () => {
    expect(() => autoWriteFromRequest(headers({ [HEADER_AGENT_KEY]: '' }), '')).toThrow(
      ForbiddenException,
    );
    expect(() => autoWriteFromRequest(headers(), '  ')).toThrow(ForbiddenException);
  });

  it('a consulta por toolCallId passa com `lookup: true`', () => {
    const consulta = { ...pedido, lookup: true };
    expect(
      autoWriteFromRequest(
        { [HEADER_AUTO_WRITE]: JSON.stringify(consulta), [HEADER_AGENT_KEY]: CHAVE },
        CHAVE,
      ),
    ).toEqual(consulta);
  });

  it('header malformado, com a chave certa, é 400', () => {
    expect(() =>
      autoWriteFromRequest({ [HEADER_AUTO_WRITE]: '{', [HEADER_AGENT_KEY]: CHAVE }, CHAVE),
    ).toThrow(BadRequestException);
  });
});

describe('McpController com o header da gravação automática', () => {
  it('cliente OAuth ou de token de API, sem a credencial do agente, leva 403 antes do servidor MCP', async () => {
    const bindAll = jest.fn();
    const registry = { intencaoHabilitada: () => false, bindAll } as unknown as McpToolRegistry;
    const controller = new McpController(registry, new ConfigService({ AGENT_API_KEY: CHAVE }));
    const req = { headers: headers() } as unknown as Request;
    await expect(
      controller.handle(req, {} as Response, { id: 'u', timezone: 'UTC' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bindAll).not.toHaveBeenCalled();
  });
});

describe('McpToolRegistry com a consulta por toolCallId', () => {
  async function chamar(autoWrite: McpAutoWriteRequest) {
    const tools = carregarTools();
    const tool = tools.find((t) => t.name === 'log_water') as McpToolDef;
    const execute = jest.spyOn(tool, 'execute').mockResolvedValue({ id: 'x' } as never);
    const registry = registryDeTeste(tools);
    const writer = {
      run: jest.fn(async () => ({ data: { gravou: true }, artifact: {} })),
      lookup: jest.fn(async () => ({ data: { achou: true }, artifact: {} })),
    };
    registry.useAutoWriter(writer);
    const server = new McpServer({ name: 't', version: '0' }, { capabilities: { tools: {} } });
    registry.bindAll(server, { userId: 'u', timezone: 'UTC', autoWrite });
    const [lado, outro] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([server.connect(lado), client.connect(outro)]);
    try {
      await client.callTool({ name: 'log_water', arguments: { ml: 250 } });
    } finally {
      await client.close();
      await server.close();
    }
    return { execute, writer };
  }

  it('`lookup: true` só consulta: não grava de novo nem executa a tool', async () => {
    const { execute, writer } = await chamar({ ...pedido, lookup: true });
    expect(writer.lookup).toHaveBeenCalledWith('u', pedido.conversationId, pedido.toolCallId);
    expect(writer.run).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('sem `lookup`, grava pelo executor da gravação automática', async () => {
    const { writer } = await chamar(pedido);
    expect(writer.run).toHaveBeenCalled();
    expect(writer.lookup).not.toHaveBeenCalled();
  });
});
