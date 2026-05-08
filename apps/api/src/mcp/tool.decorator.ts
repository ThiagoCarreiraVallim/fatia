// apps/api/src/mcp/tool.decorator.ts
import 'reflect-metadata';
import type { ZodRawShape, z } from 'zod';

export interface McpToolContext {
  userId: string;
}

export interface McpToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  execute(input: z.infer<z.ZodObject<S>>, ctx: McpToolContext): Promise<unknown>;
}

export const MCP_TOOL_METADATA = 'mcp:tool';

export const McpTool = (): ClassDecorator => (target) => {
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, target);
};
