/**
 * Imprime o `tools/list` que o `/mcp` serve numa superfície, montado em processo pelo
 * `McpToolRegistry` — sem banco, sem Logto. É a entrada de `run_fronteira medir --de-arquivo`
 * quando não há API no ar; com API, o `medir` lê do `/mcp` direto, e os dois dão o mesmo
 * `sha256` (o `superficie.spec.ts` confere o publicado).
 *
 *   pnpm --filter @fatia/api catalogo:servido intencao > /tmp/b.json
 */
import 'reflect-metadata';
import { writeSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { catalogoServido } from '../src/mcp/__tests__/support/catalogo-servido';
import { superficieDoHeader } from '../src/mcp/intent/superficie';

async function main(): Promise<void> {
  // O registry anuncia no log as tools que descobriu; aqui o stdout é só o JSON.
  Logger.overrideLogger(false);
  const superficie = superficieDoHeader(process.argv[2] ?? 'entidade');
  const tools = await catalogoServido(superficie);
  writeSync(1, `${JSON.stringify({ tools })}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
