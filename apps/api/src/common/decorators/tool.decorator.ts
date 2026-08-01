import 'reflect-metadata';
import type { ZodRawShape, z } from 'zod';

export interface McpToolContext {
  userId: string;
  timezone: string;
}

/**
 * Anotações da spec MCP. O diretório de conectores da Anthropic exige que toda
 * tool declare `title` e o hint aplicável — é o requisito 2 da submissão, e o
 * passo "Tools" do portal recusa quem não tem.
 *
 * ⚠️ `destructiveHint` tem default **true** na spec quando `readOnlyHint` é
 * falso. Omitir numa tool de escrita comum faria o Claude pedir confirmação a
 * cada refeição registrada — por isso as escritas não destrutivas declaram
 * `destructiveHint: false` explicitamente, em vez de deixar implícito.
 */
export interface McpToolAnnotations {
  /** Só lê; nunca altera estado. Dispensa confirmação por chamada. */
  readOnlyHint?: boolean;
  /** Apaga ou torna irrecuperável. O Claude sempre confirma antes. */
  destructiveHint?: boolean;
}

export interface McpToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  /** Nome de exibição, legível por humano. Exigido pelo diretório. */
  title: string;
  description: string;
  annotations: McpToolAnnotations;
  inputSchema: S;
  execute(input: z.infer<z.ZodObject<S>>, ctx: McpToolContext): Promise<unknown>;
}

export const MCP_TOOL_METADATA = 'mcp:tool';

export const McpTool = (): ClassDecorator => (target) => {
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, target);
};
