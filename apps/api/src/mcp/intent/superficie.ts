import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { McpSurface, McpToolDef } from '../../common/decorators/tool.decorator';
import { isSharedWithIntentSurface } from './intent-surface';

/**
 * Qual recorte do catálogo o `/mcp` serve numa requisição — o "um header de diferença" do
 * eval da fronteira de tools (`docs/eval-fronteira-de-tools.md`).
 *
 * O recorte entra no `McpToolRegistry.bindAll`, no mesmo lugar em que a autorização já
 * decide o que registrar, e pelo mesmo motivo: tool não registrada não aparece no
 * `tools/list` e não existe para o modelo. Sem o header, o `/mcp` serve exatamente o que
 * servia antes.
 */

export const HEADER_SUPERFICIE = 'x-fatia-superficie';

const SUPERFICIES: readonly McpSurface[] = ['entidade', 'intencao'];

/** Ausente é `entidade`; valor desconhecido é 400, e não o recorte de sempre em silêncio. */
export function superficieDoHeader(valor: string | string[] | undefined): McpSurface {
  if (valor === undefined) return 'entidade';
  const bruto = Array.isArray(valor) ? valor : [valor];
  if (bruto.length !== 1 || !(SUPERFICIES as readonly string[]).includes(bruto[0])) {
    throw new BadRequestException(
      `${HEADER_SUPERFICIE} aceita ${SUPERFICIES.join(' ou ')}; recebeu ${JSON.stringify(valor)}.`,
    );
  }
  return bruto[0] as McpSurface;
}

/**
 * Na superfície de entidade, toda tool que não é de intenção. Na de intenção, as de
 * intenção e as de entidade que o contrato declara iguais nos dois braços.
 */
export function servidaNa(
  tool: Pick<McpToolDef, 'name' | 'annotations' | 'surface'>,
  superficie: McpSurface,
): boolean {
  const propria = tool.surface ?? 'entidade';
  if (superficie === 'entidade') return propria === 'entidade';
  return propria === 'intencao' || isSharedWithIntentSurface(tool);
}

const LIGADA = new Set(['1', 'true']);

/**
 * A flag `MCP_SUPERFICIE_INTENCAO`. Desligada por padrão, e **recusada** em produção: a
 * superfície de intenção é instrumento de medição, cobre só o que as 43 tarefas do eval
 * exercitam, e um cliente de verdade que mandasse o header perderia metade do produto.
 */
@Injectable()
export class SuperficieDeIntencao {
  private readonly ligada: boolean;

  constructor(@Optional() config?: ConfigService) {
    const ler = (nome: string) => config?.get<string>(nome) ?? process.env[nome];
    this.ligada = LIGADA.has(String(ler('MCP_SUPERFICIE_INTENCAO') ?? '').toLowerCase());
    if (this.ligada && ler('NODE_ENV') === 'production') {
      throw new Error(
        'MCP_SUPERFICIE_INTENCAO é instrumento do eval da fronteira e não sobe com ' +
          'NODE_ENV=production.',
      );
    }
  }

  habilitada(): boolean {
    return this.ligada;
  }
}
