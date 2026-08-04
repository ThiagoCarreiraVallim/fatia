import type { PrismaClient } from '@fatia/db';

/**
 * Quem conta como **aluno ativo** no ciclo (#158).
 *
 * A regra em português, que é a que vale para a academia, está em
 * `docs/BILLING.md`. Este arquivo é a mesma regra computável — e nada além dela.
 *
 * ## Por que isto NÃO passa por vínculo profissional
 *
 * Seria natural reaproveitar `ProfessionalAccessService.assertReadable`, já que
 * ele é a porta única de leitura entre contas (ADR 014). Seria errado: aquela
 * porta existe para **leitura profissional consentida**, e passar por ela diria
 * que o dono da academia está lendo dado do aluno. Não está. Contagem de cabeça
 * é medição da plataforma sobre si mesma, como um contador de linhas — o
 * resultado que sai daqui é `Set<string>` de ids, sem um único registro, sem uma
 * data, sem um conteúdo. Um `getSet` que devolvesse "última refeição em 12/07"
 * seria vigilância com nome de auditoria.
 *
 * O contrário também é verdade e é o que a revisão precisa conferir: **nenhuma
 * linha daqui pode virar consentimento**. Contar não autoriza ler.
 *
 * ## Por que uso de IA não entra
 *
 * Decisão do dono em 31/07/2026: cobrança é por cabeça. O aluno que traz a
 * própria IA (#164) conta igual ao que usa a hospedada, e o que nunca tocou em
 * IA conta igual aos dois. Ler consumo de IA aqui reintroduziria a dependência
 * de atribuição de custo (#165) e produziria uma conta que a academia não
 * consegue conferir sozinha.
 */

/** O recorte do Prisma que a contagem enxerga. Nada além destes sete domínios. */
export type AtividadeDb = Pick<
  PrismaClient,
  'meal' | 'workoutSession' | 'weightLog' | 'stepLog' | 'waterLog' | 'goal'
>;

/**
 * Ids que registraram atividade própria na janela.
 *
 * Devolve `Set<string>` e **nada mais**. A assinatura é o contrato de
 * privacidade: quem chama não tem como saber *o que* a pessoa registrou, nem
 * quando, mesmo que queira.
 *
 * @param userIds candidatos — sempre os membros do grupo patrocinado, nunca "todos"
 * @param from início da janela, inclusivo (instante, já cortado no fuso do ciclo)
 * @param to fim da janela, exclusivo
 */
export async function usuariosAtivos(
  db: AtividadeDb,
  userIds: readonly string[],
  from: Date,
  to: Date,
): Promise<Set<string>> {
  // Sem candidatos não há consulta. `in: []` devolveria vazio de todo jeito, mas
  // seis idas ao banco para descobrir isso é desperdício num job mensal que roda
  // por grupo.
  if (userIds.length === 0) return new Set();

  const alvo = [...userIds];
  const janela = { gte: from, lt: to };
  // `select` e `distinct` repetidos em cada consulta, e não num objeto
  // espalhado: o `distinct` do Prisma é tipado por modelo, e um literal
  // compartilhado só passaria com `as`, que é justamente o que apagaria a
  // checagem de que o campo existe naquela tabela.

  // Uma consulta por domínio, todas com `distinct` no banco: sem isso, uma
  // academia com aluno de mil refeições traria mil linhas para descobrir um bit.
  //
  // O campo de data é o do **registro** (`createdAt`/`loggedAt`) onde ele
  // existe, e não o declarado pelo usuário (`eatenAt`/`loggedAt` de peso): a
  // regra fala em "registrou atividade no app nos últimos 30 dias", e quem
  // lança hoje uma refeição de semana passada usou o app hoje. `WorkoutSession`
  // é a exceção — não tem coluna de registro, então vale `startedAt`.
  const [refeicoes, sessoes, pesos, passos, agua, metas] = await Promise.all([
    db.meal.findMany({
      where: { userId: { in: alvo }, createdAt: janela },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.workoutSession.findMany({
      where: { userId: { in: alvo }, startedAt: janela },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.weightLog.findMany({
      where: { userId: { in: alvo }, createdAt: janela },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.stepLog.findMany({
      where: { userId: { in: alvo }, loggedAt: janela },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.waterLog.findMany({
      where: { userId: { in: alvo }, loggedAt: janela },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.goal.findMany({
      // Meta criada **ou** concluída. Concluir uma meta antiga é atividade, e
      // olhar só para `createdAt` deixaria de fora quem fechou no ciclo o que
      // começou meses atrás.
      where: {
        userId: { in: alvo },
        OR: [{ createdAt: janela }, { completedAt: janela }],
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const ativos = new Set<string>();
  for (const linhas of [refeicoes, sessoes, pesos, passos, agua, metas]) {
    for (const { userId } of linhas) ativos.add(userId);
  }

  return ativos;
}
