import { NotFoundException } from '@nestjs/common';
import type { McpToolContext, McpToolDef } from '../../common/decorators/tool.decorator';
import { rankByRelevance } from '../../common/search-text';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../../progress/helpers/date-tz';
import {
  intentSpec,
  type IntentInput,
  type IntentSpec,
  type IntentToolName,
} from './intent-surface';

/**
 * O que uma tool de intenção faz pelo agente e que no braço A é trabalho dele — e nada além
 * disso. É a lista de `docs/eval-fronteira-de-tools.md` §"O braço B": data relativa no fuso
 * da conta, nome no lugar de id, atualização parcial, somar em vez de substituir. Regra de
 * negócio não entra aqui: ela mora nos services, que as pernas já chamam (ADR 006).
 */

/**
 * A base das 18 tools de intenção: nome, título, descrição, anotações, schema e `compoe` vêm
 * do contrato (`intent-surface.ts`), sem cópia. Uma descrição editada lá é a servida aqui.
 */
export abstract class IntentTool<N extends IntentToolName> implements McpToolDef<
  IntentSpec<N>['inputSchema']
> {
  readonly surface = 'intencao' as const;
  readonly hostedInference = false;
  readonly name: N;
  readonly title: string;
  readonly description: string;
  readonly annotations: IntentSpec<N>['annotations'];
  readonly inputSchema: IntentSpec<N>['inputSchema'];
  readonly compoe: readonly string[];

  protected constructor(nome: N) {
    const spec = intentSpec(nome);
    this.name = nome;
    this.title = spec.title;
    this.description = spec.description;
    // O `as` é só para o TypeScript: `intentSpec(nome)` já devolve o contrato de `N`, mas ele não
    // estreita a união das 18 dentro de uma classe genérica.
    this.annotations = spec.annotations as IntentSpec<N>['annotations'];
    this.inputSchema = spec.inputSchema as IntentSpec<N>['inputSchema'];
    this.compoe = spec.compoe;
  }

  abstract execute(input: IntentInput<N>, ctx: McpToolContext): Promise<unknown>;
}

const DIAS_DA_SEMANA = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/**
 * `today`, `yesterday`, um dia da semana ou `YYYY-MM-DD`, em `YYYY-MM-DD` no fuso da conta.
 * O dia da semana é a ocorrência mais recente, hoje incluso — "o que almocei na terça" numa
 * terça é hoje.
 */
export function resolverDia(dia: string | undefined, fuso: string): string {
  const hoje = todayInTz(fuso);
  if (dia === undefined || dia === 'today') return hoje;
  if (dia === 'yesterday') return addDaysIso(hoje, -1);
  const alvo = (DIAS_DA_SEMANA as readonly string[]).indexOf(dia);
  if (alvo < 0) return dia;
  const atual = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return addDaysIso(hoje, -((atual - alvo + 7) % 7));
}

/** Um instante dentro do dia, para a perna que pede horário (`loggedAt`, `eatenAt`). */
export function meioDiaDe(dia: string, fuso: string): string {
  const { start } = dayBoundsInTz(dia, fuso);
  return new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString();
}

/**
 * O item que a pessoa nomeou, pela mesma ordem de relevância das buscas do catálogo. Nada
 * casando é `NOT_FOUND` com o que existe, para o modelo poder corrigir o nome sem outra
 * chamada.
 */
export function escolherPorNome<T>(
  alvo: string,
  itens: readonly T[],
  nomeDe: (item: T) => string,
  oQue: string,
): T {
  const [melhor] = rankByRelevance([...itens], alvo, nomeDe, 1);
  if (melhor !== undefined) return melhor;
  const existentes = itens.map(nomeDe);
  throw new NotFoundException(
    existentes.length
      ? `Nenhum ${oQue} com "${alvo}". Existem: ${existentes.join(', ')}.`
      : `Nenhum ${oQue} cadastrado.`,
  );
}

/**
 * A janela que uma perna aceita para os `dias` pedidos: a menor que cobre o pedido, ou a
 * maior que ela tem. As pernas de progresso aceitam conjuntos diferentes (14, 30, 90…), e a
 * resposta diz a janela usada em cada parte em vez de fingir que todas são a mesma.
 */
export function janelaDa<T extends number>(dias: number, aceitas: readonly T[]): T {
  const ordenadas = [...aceitas].sort((a, b) => a - b);
  return ordenadas.find((j) => j >= dias) ?? ordenadas[ordenadas.length - 1];
}
