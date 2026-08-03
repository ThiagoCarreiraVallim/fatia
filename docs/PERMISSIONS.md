# Papéis e permissões no grupo

> Entregável da issue #156 (épica #152). Complementa a
> [ADR 014](./ADR/014-compartilhamento-b2b-copia-e-vinculo.md), que decidiu **como** academia,
> personal e nutricionista entram no produto sem transformar cada service de domínio em código
> consciente de grupo.

## As duas perguntas, e por que não são a mesma

O texto original da issue pedia "um guard na API cobrindo papel e consentimento juntos — os dois,
nunca só um". A intenção está certa; a forma, não. Papel e consentimento respondem perguntas
diferentes e moram em camadas diferentes:

| Pergunta                                        | Quem responde                         | Onde roda                             |
| ----------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Este papel pode **administrar** isto no grupo?  | `apps/api/src/sharing/permissions.ts` | `GroupRoleGuard`, no pipeline da rota |
| Este profissional pode **ler** este dado agora? | `ProfessionalLink` (consentimento)    | `ProfessionalAccessService`, na porta |

Um guard único teria de rodar em **todas** as rotas de domínio para descobrir se aquela leitura é
do próprio dono ou de um aluno — ou seja, espalharia consciência de grupo pelos services, só que
um andar acima. É o desenho que a ADR 014 rejeitou.

Então não é "só um": **são dois mecanismos, cada um no seu lugar, e este documento descreve os
dois.** É mais garantia, não menos.

## Acúmulo de papéis é impossível por construção

A armadilha clássica ("o dono também é trainer por padrão") deixa de ser risco de disciplina em
dois níveis:

1. `@@unique([groupId, userId])` em `GroupMembership`: não existe linha em que alguém seja `OWNER`
   **e** `PROFESSIONAL` do mesmo grupo. Um papel por pessoa por grupo.
2. `ProfessionalAccessService` **nunca consulta papel para conceder**. Ele consulta
   `ProfessionalLink`. Papel nenhum concede leitura — a única forma de ler é uma linha que o
   titular criou.

`Role.ADMIN` continua sem significado nenhum aqui. É papel de **plataforma**, não de grupo, não
aparece em `permissions.ts` e nenhum service consulta `role` para ampliar escopo
(`docs/THREAT_MODEL.md` §4). O B2B não abriu essa porta.

## Ações administrativas (papel decide)

| Ação               | OWNER | PROFESSIONAL | CREATOR | MEMBER |
| ------------------ | ----- | ------------ | ------- | ------ |
| `group.read`       | sim   | sim          | sim     | sim    |
| `group.update`     | sim   | não          | não     | não    |
| `group.delete`     | sim   | não          | não     | não    |
| `invite.create`    | sim   | sim          | não     | não    |
| `invite.revoke`    | sim   | sim          | não     | não    |
| `member.list`      | sim   | sim          | sim     | sim    |
| `member.approve`   | sim   | não          | não     | não    |
| `member.remove`    | sim   | não          | não     | não    |
| `billing.read`     | sim   | não          | não     | não    |
| `billing.manage`   | sim   | não          | não     | não    |
| `content.publish`  | não   | sim          | sim     | não    |
| `content.moderate` | sim   | não          | sim     | não    |
| `offer.create`     | não   | sim          | não     | não    |
| `insights.read`    | sim   | não          | não     | não    |

Quatro linhas merecem justificativa, porque são as que alguém tentaria "corrigir" numa revisão
futura:

- **`member.list` abre para todo mundo, e isso não é frouxidão.** A matriz decide **se** a rota
  abre; **o que** cada papel enxerga é projeção do `MembershipService`: `OWNER` e `PROFESSIONAL`
  veem o grupo inteiro, `MEMBER` e `CREATOR` veem só quem administra ou atende, mais eles mesmos.
  A lista de alunos de uma academia é informação sobre pessoas e não é do interesse de outro
  aluno — mas fechar a rota para `MEMBER` tiraria dele a tela em que ele confere quem é o
  profissional que está pedindo consentimento.
- **`billing.read` é `OWNER` e só.** Gerir o negócio não implica ver dado de saúde — e o inverso
  também: o profissional não vê a fatura.
- **`insights.read` é `OWNER` e só.** O painel agregado (#159/#160) é do dono. O profissional já
  tem o caminho individual, com consentimento; dar-lhe também o agregado seria dois caminhos para
  a mesma informação com regras diferentes.
- **`content.moderate` é `OWNER` e `CREATOR`.** `PROFESSIONAL` não modera: não é papel de
  moderação, e acumular seria a mesma armadilha que o resto do documento evita.

**Sair do grupo não está na tabela, de propósito.** `DELETE /groups/:groupId/members/me` não
consulta papel: a autorização é a posse da própria associação, e nenhum papel pode impedir alguém
de sair. O dono é a única exceção, e ela não é sobre permissão — grupo sem dono fica órfão com
cobrança viva (#158).

## Leitura de dado de titular (papel NÃO decide — vínculo decide)

| Escopo      | Quem pode receber vínculo | Quem NUNCA recebe             |
| ----------- | ------------------------- | ----------------------------- |
| `WORKOUT`   | PROFESSIONAL              | OWNER, CREATOR, MEMBER, ADMIN |
| `NUTRITION` | PROFESSIONAL              | OWNER, CREATOR, MEMBER, ADMIN |
| `BODY`      | PROFESSIONAL              | OWNER, CREATOR, MEMBER, ADMIN |
| `HABITS`    | PROFESSIONAL              | OWNER, CREATOR, MEMBER, ADMIN |
| `GOALS`     | PROFESSIONAL              | OWNER, CREATOR, MEMBER, ADMIN |

Esta tabela é **igual em todas as linhas de propósito**, e é isso que ela tem a dizer: nenhum
papel lê nada. `PROFESSIONAL` aparece só como "pode receber", que não é o mesmo que "tem" — sem
uma linha de `ProfessionalLink` criada pelo titular, com aquele escopo, ativa, no mesmo grupo, a
leitura responde o mesmo `NOT_FOUND` que um estranho receberia.

Consentir um escopo não abre outro: a porta confere `scopes: { has: scope }`, um escopo por
chamada. `hasSome` com lista casaria com tudo, e consentir treino abriria a dieta.

## Como isto não apodrece

- `apps/api/src/sharing/__tests__/permission-matrix.spec.ts` parseia **as duas tabelas acima** e
  confronta com `permissions.ts` nos dois sentidos: linha na doc sem entrada no código falha, e
  entrada no código sem linha na doc falha também. Mudar uma célula de `sim` para `não` sem mexer
  no código quebra o CI.
- A segunda tabela é conferida contra o **enum** `ShareScope`: escopo novo no schema sem linha
  aqui quebra. É a mitigação do "escopo novo sem mapeamento" — o toggle nasceria na UI sem nada
  do outro lado.
- `apps/api/src/common/__tests__/user-isolation.spec.ts` roda contra Postgres real os casos de
  "papel não lê": `OWNER`, `CREATOR` e `MEMBER` × os cinco escopos, todos recusados mesmo com o
  usuário sendo membro ativo do grupo do titular.
- `apps/api/src/mcp/__tests__/tool-delegation.spec.ts` classifica **toda** tool MCP e reprova a
  que aceitar a associação de outra pessoa sem passar pela porta certa.
