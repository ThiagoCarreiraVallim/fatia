import type { Prisma } from '@fatia/db';

/**
 * Os itens de uma refeição na ordem em que foram registrados.
 *
 * Sem `orderBy`, o Postgres devolvia os itens na ordem física da tabela, e um UPDATE que não
 * cabe na mesma página grava a linha em outro lugar: editar o feijão do almoço podia mandá-lo
 * para o fim da lista, às vezes sim, às vezes não. `seq` é a ordem de inserção
 * (`MealItem.seq`), e o `PrismaService` a omite de toda resposta.
 */
export const ITENS_EM_ORDEM = {
  // `seq` é SERIAL — uma sequência global, `nextval` atômico, e não `MAX(seq) + 1` por
  // refeição: inserções concorrentes não empatam. O `id` desempata o que não deveria acontecer
  // (uma linha gravada com `seq` à mão), para que nem assim a ordem física volte a decidir.
  items: { orderBy: [{ seq: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.MealInclude;
