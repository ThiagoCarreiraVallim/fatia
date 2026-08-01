# ADR 014 — Compartilhamento B2B: cópia na ida, vínculo consentido na volta

**Status:** Accepted
**Data:** 2026-08-01

## Contexto

A épica #152 traz academia, personal trainer e nutricionista para dentro do produto. Isso quebra a
premissa mais forte da arquitetura atual: **hoje nenhum usuário enxerga dado de outro, em nenhum
caminho.** Todo service filtra por `userId`, `assertOwner` valida posse antes de mutar, e recurso
de outra pessoa responde `NOT_FOUND` idêntico a inexistente para não virar oráculo de existência
(#92).

Essa garantia é 100% da aplicação. A [ADR 010](./010-row-level-security.md) decidiu conscientemente
não usar Row-Level Security no Postgres — o argumento decisivo foi o pgbouncer em transaction
pooling, onde `SET LOCAL` não sobrevive. Ela também listou os gatilhos para reabrir, e um deles é
literalmente **"contrato empresarial"**.

Ou seja: a #153 é o gatilho previsto. A pergunta não era _se_ mexer, era _quanto_.

O desenho ingênuo — grupo com membros, e quem tem papel no grupo lê o dado de quem é membro —
transformaria cada uma das ~20 tabelas de dado de usuário num caminho de leitura cruzada. Cada
service passaria a ter dois modos, o teste de isolamento de 50 casos viraria uma matriz de papéis,
e o `NOT_FOUND` indistinguível deixaria de valer uniformemente.

## Decisão

**Duas direções, dois mecanismos.** Nenhum dos dois transforma os services de domínio em
código consciente de grupo.

### Profissional → aluno: cópia no aceite

O profissional monta um plano — genérico ou um que ele já tenha — e **oferece**. O aluno vê a
oferta e aceita. O aceite **materializa uma cópia sob o `userId` do aluno**.

A partir daí não há vínculo vivo: é o plano _dele_, que ele edita e apaga à vontade, e mudança
posterior do profissional não retroage. A oferta guarda a proveniência (quem ofereceu, de qual
original), então dá para responder "de onde veio isto" sem manter acoplamento.

Isso não é padrão novo neste repositório. É exatamente o que `clone_exercise` faz hoje
(`exercise.service.ts#cloneForEdit`): cópia editável do catálogo base, com `clonedFromId` apontando
a origem, e a base sumindo das listagens do usuário em favor da cópia.

### Aluno → profissional: leitura autorizada por vínculo consentido

Para acompanhar evolução, cópia não serve — o profissional precisa ver o que aconteceu depois.
Aqui há leitura cruzada de verdade, e ela é estreita e explícita:

- **`ProfessionalLink`** — tabela de vínculo, não colunas em `User`. Guarda quem vê, de quem,
  em qual papel, sob qual academia, quais escopos foram consentidos, quando, e quando foi revogado.
- **Consentimento por escopo**, não tudo-ou-nada: treino, nutrição, peso e passos são
  independentes. Consentir acompanhamento de treino não abre o diário alimentar.
- **Revogação preserva histórico.** `revokedAt` em vez de `DELETE`, para responder "quem teve
  acesso a quê, quando" — que o `THREAT_MODEL.md` hoje lista como ausência conhecida.

**Tabela de vínculo, e não `companyId`/`personalId` em `User`.** Duas colunas assumem, para sempre,
no máximo uma academia e um profissional por pessoa. Alguém com nutricionista _e_ personal, troca
de academia com histórico, ou consentimento diferente por profissional — qualquer um desses vira
migration de dado sobre permissão de leitura de dado de saúde, que é a pior migration possível.
A tabela custa o mesmo agora.

## Consequências

### Positivas

- **A ADR 010 continua válida.** Sem RLS, sem `SET LOCAL`, sem risco com pgbouncer.
- **Os services de domínio não mudam.** Meal, workout, weight e o resto continuam filtrando por
  `userId` e ignorando a existência de grupo. Toda a lógica de vínculo vive numa camada só.
- **A distribuição de plano herda um padrão testado**, em vez de inventar.
- A superfície de leitura cruzada é **uma**, e portanto auditável. Não há vinte.

### Negativas

- **O `NOT_FOUND` indistinguível deixa de ser universal.** Passa a existir um caminho em que um
  usuário lê dado de outro. Mitigação: o teste de isolamento ganha os três casos que importam —
  profissional **sem** vínculo recebe o mesmo `NOT_FOUND` de um estranho; vínculo **revogado**,
  idem; e escopo **não consentido** é barrado mesmo com vínculo ativo.
- **Plano copiado não recebe correção do profissional.** É consequência aceita: o dado é do aluno.
  Se acompanhamento contínuo virar requisito, é oferta nova, não mutação silenciosa do que já é
  dele.
- Duplicação de dado no aceite. Irrelevante na escala — plano de treino tem dezenas de linhas.

### Neutras

- O `THREAT_MODEL.md` ganha o vetor de acesso profissional, com o que está e o que não está
  protegido.

## Alternativas consideradas

- **Grupo com leitura direta por papel.** Rejeitada: espalha consciência de grupo por todos os
  services, multiplica a matriz de teste de isolamento, e transforma a garantia mais forte do
  produto numa condicional em vinte lugares.
- **`companyId` + `personalId` em `User`.** Considerada e preterida em favor da tabela. Mais
  simples de ler, mas amarra o produto a um profissional por pessoa e joga o custo para uma
  migration futura sobre dado sensível.
- **RLS no Postgres para o acesso profissional.** Rejeitada pelo mesmo motivo da ADR 010: o
  pooler. E resolveria um problema que a cópia + vínculo estreito já evita.
- **Compartilhar por referência, com o aluno lendo o plano do profissional.** Rejeitada: inverte
  a direção do risco. O aluno passaria a depender de linha que não é dele, e apagar a conta do
  profissional quebraria o treino de quem ficou.
