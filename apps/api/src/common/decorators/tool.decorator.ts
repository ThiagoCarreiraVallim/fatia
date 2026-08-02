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
 * Os dois campos são **obrigatórios**, não opcionais. Dois motivos:
 *
 * 1. `destructiveHint` tem default **true** na spec quando `readOnlyHint` é
 *    falso. Omitir numa escrita comum faria o Claude pedir confirmação a cada
 *    refeição registrada.
 * 2. O validador do portal de submissão exige `readOnlyHint` presente em toda
 *    tool, inclusive nas de escrita, onde o valor é `false`. Deixar implícito
 *    é indistinguível de esquecimento — para o portal e para quem lê o código.
 */
export interface McpToolAnnotations {
  /** Só lê; nunca altera estado. Dispensa confirmação por chamada. */
  readOnlyHint: boolean;
  /** Apaga ou torna irrecuperável. O Claude sempre confirma antes. */
  destructiveHint: boolean;
}

export interface McpToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  /** Nome de exibição, legível por humano. Exigido pelo diretório. */
  title: string;
  description: string;
  annotations: McpToolAnnotations;
  /**
   * A execução desta tool dispara inferência **paga pela Fatia** (visão, LLM,
   * embedding) — issue #165.
   *
   * Serve para uma armadilha de custo que não tem sintoma até a fatura: quem
   * chama o `/mcp` é o modelo do usuário, e chamada de cliente MCP externo não
   * passa pelo nosso gateway de IA. Logo, hoje ela custa **zero** de inferência
   * para a Fatia. Expor uma tool que internamente chama IA hospedada inverte
   * isso em silêncio: o usuário pede pelo Claude dele e a conta cai aqui, sem
   * nada no caminho para acusar. O de melhor margem vira o de pior.
   *
   * **Obrigatório, não opcional com default `false`** — pelo mesmo motivo já
   * escrito acima para `destructiveHint`: um default faria justamente a tool
   * cara nascer classificada como grátis, que é o caso que este campo existe
   * para impedir. Quem esquece, esquece na direção errada.
   *
   * **Fora de `annotations` de propósito.** O registry serve `annotations`
   * no fio (`mcp-tool.registry.ts`), em toda sessão que lista as tools: isto é
   * política interna de custo, não anotação da spec MCP, e não tem por que ser
   * lido pelo cliente nem gastar contexto dele.
   *
   * A política de quando `true` é aceitável está na ADR 018. O guarda em
   * `tool-catalog.spec.ts` reprova qualquer tool que declare `true` sem estar
   * na lista de exceções de lá — a decisão tem de ser de propósito.
   */
  hostedInference: boolean;
  inputSchema: S;
  execute(input: z.infer<z.ZodObject<S>>, ctx: McpToolContext): Promise<unknown>;
}

export const MCP_TOOL_METADATA = 'mcp:tool';

export const McpTool = (): ClassDecorator => (target) => {
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, target);
};
