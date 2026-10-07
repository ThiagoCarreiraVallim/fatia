/**
 * Os itens de uma refeição na ordem em que foram registrados.
 *
 * Sem `orderBy`, o Postgres devolvia os itens na ordem física da tabela, e um UPDATE que não
 * cabe na mesma página grava a linha em outro lugar: editar o feijão do almoço podia mandá-lo
 * para o fim da lista, às vezes sim, às vezes não. `seq` é a ordem de inserção
 * (`MealItem.seq`), e o `PrismaService` a omite de toda resposta.
 */
export const ITENS_EM_ORDEM = { items: { orderBy: { seq: 'asc' } } } as const;
