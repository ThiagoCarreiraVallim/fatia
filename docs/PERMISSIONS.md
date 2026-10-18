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

### E toda rota diz em qual das duas ela vive

Um controller de `sharing/` declara a camada por decorator, e não existe rota sem declaração:

| Decorator             | O que afirma                                  | Quem barra de fato                     |
| --------------------- | --------------------------------------------- | -------------------------------------- |
| `@RequireGroupAction` | administra o grupo; papel decide              | `GroupRoleGuard`, pelo `:groupId`      |
| `@SelfOnly`           | age sobre quem chamou; papel não decide nada  | o próprio `userId` do contexto         |
| `@ConsentGoverned`    | lê dado de outra pessoa; **o vínculo** decide | `assertReadable`, pelo `:membershipId` |
| `@InvitePreview`      | cartão do convite, sem login                  | o próprio token, que é o segredo       |

O terceiro entrou com o painel do profissional (#157). Ele não é um afrouxamento: continua não
existindo rota sem declaração, e `permission-matrix.spec.ts` cobra de cada rota `@ConsentGoverned`
que ela enderece o titular por `:membershipId` — porque a variante que a ADR 014 proíbe é
justamente resolver o aluno por um identificador de usuário vindo de fora.

O quarto, `@InvitePreview`, entrou com os convites (Fase 5) e é a única rota pública de
`sharing/`: `GET /groups/invites/:token` mostra a quem recebeu o link **que comunidade** o
convidou, antes de criar conta. Não lê dado de ninguém nem age sobre ninguém. O spec cobra que a
rota tenha `:token` na URL — sem o token, uma rota pública de grupo seria um catálogo aberto — e
o throttle da rota é baixo. Convite inválido, expirado, revogado, esgotado ou de outro e-mail
responde o mesmo `NOT_FOUND`.

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
| `group.transfer`   | sim   | não          | não     | não    |
| `invite.create`    | sim   | sim          | não     | não    |
| `invite.revoke`    | sim   | sim          | não     | não    |
| `member.list`      | sim   | sim          | sim     | sim    |
| `member.approve`   | sim   | não          | não     | não    |
| `member.remove`    | sim   | não          | não     | não    |
| `member.role`      | sim   | não          | não     | não    |
| `billing.read`     | sim   | não          | não     | não    |
| `billing.manage`   | sim   | não          | não     | não    |
| `content.publish`  | sim   | sim          | sim     | não    |
| `content.read`     | sim   | sim          | sim     | sim    |
| `content.moderate` | sim   | não          | sim     | não    |
| `offer.create`     | não   | sim          | não     | não    |
| `challenge.manage` | sim   | sim          | sim     | não    |
| `challenge.join`   | sim   | sim          | sim     | sim    |
| `post.read`        | sim   | sim          | sim     | sim    |
| `post.create`      | sim   | sim          | sim     | sim    |
| `member.ban`       | sim   | não          | não     | não    |
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
- **`invite.create` abre para `PROFESSIONAL`, mas só como `MEMBER`.** Quem define a equipe é
  o dono: o `InviteService` recusa convite de profissional para papel de equipe, e ninguém é
  convidado como `OWNER` — dono se transfere (`group.transfer`, o antigo dono fica na equipe
  como `PROFESSIONAL`).
- **`member.role` é `OWNER` e só.** Virar equipe é passar a receber o que cada membro consentiu
  à comunidade, então só quem define a equipe muda papel. Os vínculos acompanham no mesmo commit:
  quem entra na equipe recebe o leque inverso, quem sai perde tudo que recebia ali
  (`revokedReason = role_changed`), e o dono não muda de papel por aqui — transfere.
- **`content.publish` inclui o `OWNER`.** Numa academia é a dona quem publica o treino e as dicas
  da casa. Publicar é escrever para a comunidade, não ler dado de ninguém. O autor edita o que é
  dele; quem tem `content.moderate` edita e tira do ar o de qualquer pessoa da equipe.
- **`content.read` abre para todo mundo.** É a vitrine de planos prontos e dicas; o rascunho fica
  de fora pelo `ContentService`, não por esta tabela.
- **O catálogo de exercícios da comunidade (Fase 7b, ADR 030) usa as mesmas ações.** Criar
  exercício e gravar tutorial é `content.publish`; o autor muda o dele e quem tem
  `content.moderate` muda o de todos. O membro enxerga o catálogo por `content.read` e pela busca
  de exercícios de sempre. O equipamento da academia é configuração dela: `group.update`.
- **O agente da comunidade no chat (Fase 7c, ADR 031) é do dono:** `group.update` configura nome,
  avatar e orientações. Não há ação nova para conversar com ele: qualquer membro ativo escolhe o
  agente ligado da comunidade no chat, e a API confere a associação a cada turno.
- **Desafios (Fase 8a, ADR 027): `challenge.manage` é da equipe, `challenge.join` de todos.** A
  equipe marca, muda antes de começar, encerra e apaga antes de começar; o autor mexe no dele e
  quem tem `content.moderate` no de qualquer um. Participar é opt-in e o **ranking só vai para quem
  participa** — a equipe vê quantos entraram, não o placar, a menos que entre também.
- **Mural (Fase 8b, ADR 032): `post.read` e `post.create` são de todos; moderar é
  `content.moderate`; banir é `member.ban`, só do dono.** `post.create` abre para `MEMBER` na
  tabela, mas a comunidade pode fechar o mural para a equipe (`Group.postPolicy = TEAM_ONLY`,
  conferido no `PostService` e no pedido de envio da imagem). Reagir, comentar e denunciar são
  `post.read`. Quem modera remove, restaura e fixa e trata a fila de denúncias, sem saber quem
  denunciou; banir é mais forte que remover membro e fica com quem remove.
- **`content.moderate` é `OWNER` e `CREATOR`.** `PROFESSIONAL` não modera: não é papel de
  moderação, e acumular seria a mesma armadilha que o resto do documento evita.

### Status da associação (papel só vale com associação viva)

Papel é uma das duas condições; a outra é o **status** da associação. `LEFT`, `REMOVED` e
`BANNED` não
exercem nada — o papel guardado numa associação encerrada faria o ex-dono continuar
administrando. `ACTIVE` exerce o que a tabela acima permite. E a associação **pendente**
(`INVITED`, criada por `POST /groups/join`) exerce só isto:

| Ação               | Pendente (`INVITED`) |
| ------------------ | -------------------- |
| `group.read`       | sim                  |
| `group.update`     | não                  |
| `group.delete`     | não                  |
| `group.transfer`   | não                  |
| `invite.create`    | não                  |
| `invite.revoke`    | não                  |
| `member.list`      | não                  |
| `member.approve`   | não                  |
| `member.remove`    | não                  |
| `member.role`      | não                  |
| `billing.read`     | não                  |
| `billing.manage`   | não                  |
| `content.publish`  | não                  |
| `content.read`     | não                  |
| `content.moderate` | não                  |
| `offer.create`     | não                  |
| `challenge.manage` | não                  |
| `challenge.join`   | não                  |
| `post.read`        | não                  |
| `post.create`      | não                  |
| `member.ban`       | não                  |
| `insights.read`    | não                  |

`group.read` é "sim" porque o grupo pendente **já aparece** em `GET /groups` (o `STATUS_VIVOS` de
`group.service.ts` inclui `INVITED`): é a tela "aguardando aprovação". Fechá-lo no guarda faria o
mesmo grupo estar na lista e responder `NOT_FOUND` ao ser aberto por id — a incoerência que
`STATUS_VIVOS` existe para eliminar, reintroduzida um andar acima. O resto é "não" porque quem
ainda não foi aprovado não administra e não enxerga gente: `member.list` inclusive, e o
`MembershipService.listMembers` exige `ACTIVE` pela mesma razão.

**Sair do grupo não está na tabela, de propósito.** `DELETE /groups/:groupId/members/me` não
consulta papel: a autorização é a posse da própria associação, e nenhum papel pode impedir alguém
de sair. O dono é a única exceção, e ela não é sobre permissão — grupo sem dono fica órfão com
cobrança viva (#158).

## Leitura de dado de titular (papel NÃO decide — vínculo decide)

| Escopo      | Quem pode receber vínculo    | Quem NUNCA recebe |
| ----------- | ---------------------------- | ----------------- |
| `WORKOUT`   | OWNER, PROFESSIONAL, CREATOR | MEMBER, ADMIN     |
| `NUTRITION` | OWNER, PROFESSIONAL, CREATOR | MEMBER, ADMIN     |
| `BODY`      | OWNER, PROFESSIONAL, CREATOR | MEMBER, ADMIN     |
| `HABITS`    | OWNER, PROFESSIONAL, CREATOR | MEMBER, ADMIN     |
| `GOALS`     | OWNER, PROFESSIONAL, CREATOR | MEMBER, ADMIN     |

Esta tabela é **igual em todas as linhas de propósito**, e é isso que ela tem a dizer: nenhum
papel lê nada. A equipe (`OWNER`, `PROFESSIONAL`, `CREATOR`) aparece só como "pode receber", que
não é o mesmo que "tem" — sem uma linha de `ProfessionalLink` criada pelo titular, com aquele
escopo, ativa, no mesmo grupo, a leitura responde o mesmo `NOT_FOUND` que um estranho receberia.

A ADR 026 abriu a coluna para o dono e o criador: o consentimento passa a ser dado **ao entrar**
(no convite ou no código), para a equipe toda de uma vez, e não mais um profissional por vez.
Os escopos escolhidos ficam em `GroupMembership.consentScopes` e viram um vínculo para cada
pessoa ativa da equipe; quem entra na equipe depois recebe os vínculos de quem já consentiu, e
quem sai perde os seus. Reescrever o consentimento do grupo (`PUT /groups/:groupId/consent`)
substitui os vínculos da pessoa naquele grupo. `MEMBER` continua nunca lendo ninguém.

Consentir um escopo não abre outro: a porta confere `scopes: { has: scope }`, um escopo por
chamada. `hasSome` com lista casaria com tudo, e consentir treino abriria a dieta.

## Como isto não apodrece

- `apps/api/src/sharing/__tests__/permission-matrix.spec.ts` parseia **as duas tabelas acima** e
  confronta com `permissions.ts` nos dois sentidos: linha na doc sem entrada no código falha, e
  entrada no código sem linha na doc falha também. Mudar uma célula de `sim` para `não` sem mexer
  no código quebra o CI.
- A tabela de associação pendente é confrontada com `PENDING_MEMBERSHIP_ACTIONS` do mesmo jeito,
  e `group-role.guard.spec.ts` põe o **guarda e o `GroupService`** para responderem a mesma
  pergunta com a mesma entrada, status por status. Enquanto cada um tinha só o seu spec, os dois
  podiam afirmar o contrário um do outro e ficar verdes — foi o que aconteceu com `INVITED`.
- O `permission-matrix.spec.ts` exige ainda que **todo arquivo que usa `@RequireGroupAction` registre
  `@UseGuards(GroupRoleGuard)`**. O decorator sozinho só grava metadata: controller anotado sem o
  guarda é rota aberta com cara de rota protegida, e conferir só o decorator aprova as duas.
- A segunda tabela é conferida contra o **enum** `ShareScope`: escopo novo no schema sem linha
  aqui quebra. É a mitigação do "escopo novo sem mapeamento" — o toggle nasceria na UI sem nada
  do outro lado.
- `apps/api/src/common/__tests__/user-isolation.spec.ts` roda contra Postgres real os casos de
  "papel não lê": `OWNER`, `CREATOR` e `MEMBER` × os cinco escopos, todos recusados mesmo com o
  usuário sendo membro ativo do grupo do titular.
- `apps/api/src/mcp/__tests__/tool-delegation.spec.ts` classifica **toda** tool MCP e reprova a
  que aceitar a associação de outra pessoa sem passar pela porta certa. Desde a #157 ele desce
  também para o service colaborador e exige a **chamada** a `assertReadable`: citar o nome da
  porta num comentário satisfazia a versão anterior, e comentário não autoriza ninguém.
- O painel do profissional (#157) é exercitado ponta a ponta em `user-isolation.spec.ts` contra
  Postgres real — sem vínculo, com escopo não consentido, com vínculo revogado e com o
  profissional demitido, todos com a **mesma** mensagem que um estranho recebe, mais o caminho
  feliz e a contagem de linhas de auditoria por escopo lido.
