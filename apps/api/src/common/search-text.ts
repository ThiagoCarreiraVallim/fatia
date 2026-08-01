/**
 * Normalização e ranqueamento de busca por nome, compartilhados pelo catálogo de
 * alimentos e pelo de exercícios.
 *
 * Dois problemas reais que isto resolve, encontrados testando o app no celular:
 *
 * 1. **Acento.** A busca era `contains` direto no nome. Quem digitava `feijao`
 *    não achava "Feijão tropeiro" — e no teclado do celular ninguém acentua. Um
 *    catálogo de comida brasileira em que "feijao" não acha feijão é um catálogo
 *    quebrado.
 * 2. **Relevância.** A ordenação era alfabética. Buscar "supino" trazia
 *    "Arremesso Supino com Dois Braços Acima da Cabeça" antes de "Supino Reto
 *    com Barra", porque A vem antes de S.
 *
 * A normalização em si mora em `@fatia/db` porque os seeds também precisam dela
 * — eles escrevem no catálogo sem passar por aqui. O ranqueamento é só da API.
 */

import { normalizeSearchText } from '@fatia/db';

export { normalizeSearchText } from '@fatia/db';

/** Menor é melhor. Usado para ordenar os resultados. */
export const enum MatchRank {
  Exact = 0,
  Prefix = 1,
  WordPrefix = 2,
  Contains = 3,
  None = 4,
}

/**
 * Quão bem `haystack` responde a `needle`, ambos já normalizados.
 *
 * A ordem é a que a pessoa espera de uma busca: o nome exato primeiro, depois o
 * que começa com o termo, depois o que tem uma **palavra** começando com o
 * termo, e por último o que apenas contém. É o que separa "Supino Reto" de
 * "Arremesso Supino".
 */
export function matchRank(haystack: string, needle: string): MatchRank {
  if (!needle) return MatchRank.None;
  if (haystack === needle) return MatchRank.Exact;
  if (haystack.startsWith(needle)) return MatchRank.Prefix;
  if (haystack.includes(` ${needle}`)) return MatchRank.WordPrefix;
  if (haystack.includes(needle)) return MatchRank.Contains;
  return MatchRank.None;
}

/**
 * Ordena por relevância e devolve os `limit` melhores.
 *
 * Empate resolve pelo nome mais curto e depois alfabeticamente: entre dois
 * "contém", o nome mais curto costuma ser o item genérico que a pessoa quis
 * ("Supino Reto com Barra" antes de "Supino Reto com Barra e Pegada Larga").
 */
export function rankByRelevance<T>(
  items: T[],
  query: string,
  nameOf: (item: T) => string,
  limit: number,
): T[] {
  const needle = normalizeSearchText(query);
  if (!needle) return items.slice(0, limit);

  return items
    .map((item) => {
      const name = nameOf(item);
      const normalized = normalizeSearchText(name);
      return { item, rank: matchRank(normalized, needle), length: normalized.length, name };
    })
    .filter((entry) => entry.rank !== MatchRank.None)
    .sort(
      (a, b) =>
        a.rank - b.rank || a.length - b.length || a.name.localeCompare(b.name, 'pt-BR'),
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}
