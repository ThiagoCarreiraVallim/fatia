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

| Ação                   | OWNER | ADMIN | PROFESSIONAL | CREATOR | RECEPTION | MEMBER |
| ---------------------- | ----- | ----- | ------------ | ------- | --------- | ------ |
| `group.read`           | sim   | sim   | sim          | sim     | sim       | sim    |
| `group.update`         | sim   | sim   | não          | não     | não       | não    |
| `group.delete`         | sim   | não   | não          | não     | não       | não    |
| `group.transfer`       | sim   | não   | não          | não     | não       | não    |
| `group.sharing`        | sim   | não   | não          | não     | não       | não    |
| `member.grant_reader`  | sim   | não   | não          | não     | não       | não    |
| `invite.create`        | sim   | sim   | sim          | não     | não       | não    |
| `invite.revoke`        | sim   | sim   | sim          | não     | não       | não    |
| `member.list`          | sim   | sim   | sim          | sim     | sim       | sim    |
| `member.approve`       | sim   | sim   | não          | não     | sim       | não    |
| `member.remove`        | sim   | sim   | não          | não     | não       | não    |
| `member.role`          | sim   | sim   | não          | não     | não       | não    |
| `member.assign`        | sim   | sim   | não          | não     | não       | não    |
| `billing.read`         | sim   | não   | não          | não     | não       | não    |
| `billing.manage`       | sim   | não   | não          | não     | não       | não    |
| `integration.manage`   | sim   | não   | não          | não     | não       | não    |
| `content.publish`      | sim   | sim   | sim          | sim     | não       | não    |
| `content.read`         | sim   | sim   | sim          | sim     | sim       | sim    |
| `content.moderate`     | sim   | sim   | não          | não     | não       | não    |
| `offer.create`         | não   | não   | sim          | não     | não       | não    |
| `challenge.manage`     | sim   | sim   | sim          | sim     | não       | não    |
| `challenge.join`       | sim   | sim   | sim          | sim     | sim       | sim    |
| `challenge.review`     | sim   | sim   | sim          | sim     | não       | não    |
| `post.read`            | sim   | sim   | sim          | sim     | sim       | sim    |
| `post.create`          | sim   | sim   | sim          | sim     | sim       | sim    |
| `announcement.publish` | sim   | sim   | sim          | não     | sim       | não    |
| `member.ban`           | sim   | sim   | não          | não     | não       | não    |
| `insights.read`        | sim   | não   | não          | não     | não       | não    |
| `panel.overview`       | sim   | sim   | sim          | não     | sim       | não    |
| `panel.search`         | sim   | sim   | sim          | não     | sim       | não    |
| `member.file`          | sim   | não   | sim          | não     | não       | não    |
| `member.plans`         | sim   | não   | sim          | não     | não       | não    |
| `member.note`          | sim   | não   | sim          | não     | não       | não    |
| `panel.review`         | sim   | não   | sim          | não     | não       | não    |
| `benefit.read`         | sim   | sim   | sim          | sim     | sim       | sim    |
| `benefit.manage`       | sim   | não   | não          | não     | não       | não    |

Quatro linhas merecem justificativa, porque são as que alguém tentaria "corrigir" numa revisão
futura:

- **`member.list` abre para todo mundo, e isso não é frouxidão.** A matriz decide **se** a rota
  abre; **o que** cada papel enxerga é projeção do `MembershipService`: `OWNER`, `ADMIN`,
  `PROFESSIONAL` e `RECEPTION` veem o grupo inteiro, `MEMBER` e `CREATOR` veem só a equipe, mais
  eles mesmos. A `RECEPTION` recebe de cada pessoa só nome, papel, situação e data de entrada (sem
  "Entrou por", responsável, WhatsApp, assento nem o que compartilha); o `ADMIN` não recebe o
  assento (é fatura). Com "profissionais veem só quem acompanham" ligado, o `PROFESSIONAL` vê só
  os membros de quem é responsável, mais a equipe.
  A lista de alunos de uma academia é informação sobre pessoas e não é do interesse de outro
  aluno — mas fechar a rota para `MEMBER` tiraria dele a tela em que ele confere quem é o
  profissional que está pedindo consentimento.
- **`billing.read` é `OWNER` e só.** Gerir o negócio não implica ver dado de saúde — e o inverso
  também: o profissional não vê a fatura. O `ADMIN` também não (#403 depende disto).
- **`insights.read` é `OWNER` e só.** O painel agregado (#159/#160) é do dono. O profissional já
  tem o caminho individual, com consentimento; dar-lhe também o agregado seria dois caminhos para
  a mesma informação com regras diferentes.
- **`panel.overview` e `panel.search` (#398) só abrem a porta do painel.** O contador de pedidos
  segue `member.approve`, o de denúncias `content.moderate`, o da fila de desafios
  `challenge.review`, convites sem aceite `invite.create`, e os números agregados da Visão geral
  (ativos em 7 dias, "entraram e ainda não registraram", gráfico) seguem `insights.read`, com o
  mínimo de 5 e o `statsOptIn`. A busca devolve só nome, papel e situação do membro, telas
  conforme a ação de cada tela e planos da biblioteca com `content.publish`; nunca dado de saúde.
  A `RECEPTION` tem `panel.overview` e `panel.search`, mas nenhuma ação que leia pessoa: vê nomes
  e situação, e aprova pedidos. Abrir o painel também carimba o "último acesso" da pessoa da
  equipe (`GroupMembership.panelSeenAt`, no máximo a cada 5 minutos), que a tela Equipe mostra.
- **Relatório do mês e origens dos convites (#400) seguem `insights.read`** (o dono), sem ação
  nova: são agregados, com o mínimo de 5 e o `statsOptIn`. Mudar a meta da equipe, ligar o e-mail
  mensal e escolher quem da equipe o recebe é `group.update` **mais** `insights.read` (o `ADMIN`
  tem o primeiro, não o segundo: não mexe num relatório que não vê); o destinatário marcado
  precisa ser profissional ou criador ativo da mesma comunidade. Toda troca de papel desliga o
  e-mail do relatório e o resumo de risco da pessoa.
- **Ficha da pessoa (#402): `member.file`, `member.plans` e `member.note` são do dono e do
  profissional.** Abrir a ficha mostra o que é da equipe (planos que ela mandou, anotações,
  agenda planejada, quem abriu a ficha); dado de saúde continua só pelo vínculo, uma categoria
  por leitura, e cada leitura entra na trilha da pessoa. Mandar plano exige, além do papel,
  `ProfessionalLink` ativo entre quem manda e a pessoa. Apagar ou terminar um plano é do autor
  ou do dono; reordenar é de quem tem `member.plans`. A anotação não é privada: a pessoa vê, só
  leitura, e ela some quando a pessoa sai da comunidade. Editar ou apagar a anotação é do autor
  ou do dono.
- **Enviar para alunos (#405): `member.plans` (dono e profissional), em `groups/:id/sends`.**
  A biblioteca (ver, publicar, rascunho, "Com quem") continua `content.publish`. Cada pessoa de
  um envio em lote precisa ser membro ativo da comunidade da URL, dentro do "profissionais veem
  só quem acompanham", e ter `ProfessionalLink` ativo com quem envia; um id que falhe barra o
  lote inteiro, como inexistente. O lote grava numa transação só: ou todos recebem, ou ninguém. "Enviados recentemente" mostra só os envios de quem olha, com
  a resposta (que já chega a quem mandou); o progresso é dado de Treino e só sai pela porta de
  leitura, com registro na trilha; sem Treino liberado, "sem progresso", sem dizer o motivo.
  Cancelar o envio sem resposta é do autor ou do dono. "Com quem" é só contagem, e abaixo de 5
  pessoas não mostra o número.
- **Assentos, programas e ofertas (#403) são dinheiro: `billing.read`/`billing.manage`, só o
  dono.** Programas por aluno (Pn-30, `GET plan-programs`) é `member.file` (dono e profissional,
  com "profissionais veem só quem acompanham"): o plano é da equipe, mas status e progresso são
  dado de Treino e só saem pela porta de leitura, com Treino liberado para quem olha e cada
  leitura na trilha da pessoa; sem isso a linha diz "enviado". O membro nunca vê fatura, preço
  nem atraso da comunidade (o `get_me` mostra só a origem e o fim do PRO).
- **"Para revisar" e "Em risco" (#399): `panel.review` é do dono e do profissional.** O papel
  só abre a tela: cada pessoa aparece só com `ProfessionalLink` ativo com quem olha, e cada
  categoria lida (treino, metas, e no em risco também alimentação, corpo e hábitos) passa pela
  porta de leitura e entra na trilha dela. As respostas aos planos que a própria comunidade mandou (aceitou ou
  recusou) aparecem para a equipe **sem vínculo nem categoria**: são a resposta a uma oferta que
  a comunidade fez, não dado de saúde, e a ficha (#402) já mostra o mesmo estado a quem tem
  `member.plans`; oferta de outra comunidade nunca entra. Ver a sessão feita, reagir e comentar exigem Treino liberado para quem olha; sem ele,
  a tela diz só que não há detalhe. O "Visto" é de cada um. Mudar o limite do em risco é
  `group.update` **mais** `panel.review` ou `insights.read` (#404): na prática, o dono. O `ADMIN`
  edita a comunidade, mas não mexe num número que não vê.
- **`invite.create` abre para `PROFESSIONAL`, mas só como `MEMBER`.** O `InviteService` usa
  `rolesGrantableBy`: o `OWNER` convida para qualquer papel, o `ADMIN` só para `MEMBER` e
  `RECEPTION`, o `PROFESSIONAL` só `MEMBER`. Ninguém é convidado como `OWNER` — dono se transfere
  (`group.transfer`, o antigo dono fica na equipe como `PROFESSIONAL`). Assento no convite é
  `billing.manage`. **Convite de equipe é poder emprestado de quem o criou:** quem sai, ou troca
  para um papel que não daria mais aquele, leva junto os convites e links de papel de equipe que
  ainda estavam valendo (no mesmo commit); o de membro fica.
- **`member.grant_reader` é `OWNER` e só (#404, ADR 043: quem define a equipe é o dono).** Dar
  papel que recebe vínculo (`PROFESSIONAL`, `CREATOR`) — por convite, link, aprovação ou troca de
  papel — é abrir o que cada membro consentiu à comunidade. Se o `ADMIN` pudesse, criaria um
  convite de profissional para uma conta dele e leria os alunos. Ele dá só `MEMBER` e `RECEPTION`.
- **`group.sharing` é `OWNER` e só (#404).** O que todo membro precisa compartilhar para entrar
  (`requiredSharingScopes`) decide o que a equipe recebe; o `ADMIN` edita o resto do perfil
  (`group.update`), não isto.
- **`member.role` é `OWNER` e `ADMIN` (#404), com limite.** Virar equipe é passar a receber o que
  cada membro consentiu à comunidade. O `ADMIN` muda o papel de quem não é `ADMIN` nem `OWNER`,
  e só para `MEMBER` ou `RECEPTION` (`canManageMember` e `rolesGrantableBy`, em `permissions.ts`):
  assim ele não se promove, não rebaixa um par, não abre leitura para ninguém, e o escalonamento
  para é no dono. Os vínculos acompanham
  no mesmo commit: quem entra num papel que recebe (`OWNER`, `PROFESSIONAL`, `CREATOR`) recebe o
  leque inverso, quem vai para `ADMIN`, `RECEPTION` ou `MEMBER` perde tudo que recebia ali
  (`revokedReason = role_changed`), e o dono não muda de papel por aqui — transfere. Toda troca
  desliga `reportEmail` e `riskDigest` e deixa uma linha `members.role` em `GroupAuditLog`. A
  especialidade do `PROFESSIONAL` (`PATCH .../members/:id/specialty`) é `member.role` também; ela
  se apaga quando a pessoa deixa de ser profissional, sai ou vira dona (com linha
  `members.specialty` na trilha), e o banco garante com um `CHECK` que só profissional tem
  especialidade. Passar a posse deixa duas linhas `members.role` (os dois lados).
- **`member.approve` é `OWNER`, `ADMIN` e `RECEPTION`.** Aprovar é pôr para dentro quem pediu;
  a recepção aprova só como `MEMBER`, o admin como `MEMBER` ou `RECEPTION`. Aprovar já com papel
  de equipe deixa linha `members.approve` na trilha. Recusar é remover a associação pendente
  (`member.remove`), que a recepção não tem.
- **`member.remove` e `member.ban` são `OWNER` e `ADMIN`.** O `ADMIN` não remove, não bane nem
  desfaz o banimento de outro `ADMIN`; ninguém remove o dono.
- **`member.assign` (#401) é `OWNER` e `ADMIN`.** É escolher quem da equipe acompanha cada membro
  ("Acompanhado por", "Trocar responsável" em massa). É administração, não leitura: quem lê dado de
  saúde continua sendo o `ProfessionalLink` que o membro deu. No convite, o profissional pode pôr
  a si mesmo como responsável; outro profissional, só o dono. Dar e tirar assento em massa seguem
  `billing.manage`. Cada lote (até 100 pessoas, tudo ou nada) deixa uma linha em `GroupAuditLog`
  com os ids e a contagem.
- **`content.publish` inclui o `OWNER`.** Numa academia é a dona quem publica o treino e as dicas
  da casa. Publicar é escrever para a comunidade, não ler dado de ninguém. O autor edita o que é
  dele; quem tem `content.moderate` edita e tira do ar o de qualquer pessoa da equipe.
- **`content.read` abre para todo mundo.** É a vitrine de planos prontos e dicas; o rascunho fica
  de fora pelo `ContentService`, não por esta tabela.
- **O catálogo de exercícios da comunidade (Fase 7b, ADR 030) usa as mesmas ações.** Criar
  exercício e gravar tutorial é `content.publish`; o autor muda o dele e quem tem
  `content.moderate` muda o de todos. O membro enxerga o catálogo por `content.read` e pela busca
  de exercícios de sempre. O equipamento da academia é configuração dela: `group.update`.
- **O agente da comunidade no chat (Fase 7c, ADR 031) é do dono e do admin:** `group.update` configura nome,
  avatar e orientações. Não há ação nova para conversar com ele: qualquer membro ativo escolhe o
  agente ligado da comunidade no chat, e a API confere a associação a cada turno.
- **Desafios (Fase 8a, ADR 027): `challenge.manage` é da equipe, `challenge.join` de todos.** A
  equipe marca, muda antes de começar, encerra e apaga antes de começar; o autor mexe no dele e
  quem tem `content.moderate` no de qualquer um. Participar é opt-in e o **ranking só vai para quem
  participa** — a equipe vê quantos entraram, não o placar, a menos que entre também.
  No redesign (#395, ADR 044 e 047) quem é da comunidade e não entrou também vê o ranking e as
  regras (apelido, dias ou pontos, sequência), nunca foto nem ml, passos ou gramas.
- **Revisão de check-in (#395, ADR 044 e 047): `challenge.review` é da equipe.** Abre a fila
  "Para revisar" (check-ins com foto e dias de água ou passos fora do padrão) e decide "Vale" ou
  "Anular" com motivo. É a única ação que mostra a foto de prova a alguém além da própria pessoa.
  Sinalizar "Não parece válido" é de quem participa do desafio, por `challenge.join`, sem ver a
  foto.
- **Mural (Fase 8b, ADR 032): `post.read` e `post.create` são de todos; moderar é
  `content.moderate`; banir é `member.ban`, só do dono.** `post.create` abre para `MEMBER` na
  tabela, mas a comunidade pode fechar o mural para a equipe (`Group.postPolicy = TEAM_ONLY`,
  conferido no `PostService` e no pedido de envio da imagem; a equipe ali inclui `ADMIN` e
  `RECEPTION`). Reagir, comentar e denunciar são `post.read`. Quem modera remove, restaura e fixa e
  trata a fila de denúncias, sem saber quem denunciou; banir é mais forte que remover membro e fica
  com quem remove.
- **Comunicados (#394): `announcement.publish` é `OWNER`, `ADMIN`, `PROFESSIONAL` e `RECEPTION`.**
  Comunicar é mandar notificação a todos (agora, agendado ou repetido) e fixar o aviso no topo;
  quem comunica também vê os agendados e cancela. Não é moderar: reordenar e desafixar avisos e
  tratar denúncias seguem em `content.moderate`. O `CREATOR` publica conteúdo, mas não manda aviso
  no celular de todos. A `RECEPTION` comunica sem moderar (aviso de horário, feriado). No mural, a
  equipe toda (`STAFF_ROLES`) publica em nome da comunidade e fixa o próprio post como aviso; o
  painel de enquetes é `content.publish`.
- **Benefícios de parceiros (#393): `benefit.read` de todos, `benefit.manage` só do dono.** O
  desconto é acordo comercial da comunidade, como a cobrança. O membro vê só os que valem (e o
  vencido de ontem, sem o cupom); o Fatia não rastreia compra nem passa dado ao parceiro.
- **`content.moderate` é `OWNER` e `ADMIN` (#404).** Moderar o mural é cuidar da comunidade, que
  é o trabalho do admin. O `CREATOR` deixou de moderar (a prancha Pn-19 tira, e é o mais
  restritivo); `PROFESSIONAL` também não: não é papel de moderação, e acumular seria a mesma
  armadilha que o resto do documento evita.
- **Equipe e permissões (#404, Pn-19): `GET .../staff` é `member.role`; `GET .../permissions` é
  `group.read`.** A tela mostra a equipe por papel, a especialidade, quantos cada um acompanha e o
  último acesso ao painel; o histórico de quem mudou papel, especialidade e responsável é só do
  dono. A tabela "O que cada papel pode fazer" sai de `PERMISSION_SUMMARY`, calculada desta matriz
  e de `canReceiveLink` — a mesma fonte do guarda. "Profissionais veem só quem acompanham"
  (`Group.proSeeOnlyAssigned`) é `group.update`.
- **Chaves de API (#413): `integration.manage` é `OWNER` e só.** A chave fala pela comunidade
  inteira, então só quem responde por ela cria e revoga. O que sai por `integrations/v1` é o mínimo
  para automação: convites, membros (nome e papel) e envios — **só planos de treino e programas
  vendidos**. Plano alimentar fica de fora de propósito: diz o que a pessoa come e encosta em dado
  de saúde, que nunca sai por chave. Cada consulta é amarrada ao `groupId` da chave; nada vem da
  URL nem do corpo.

**Recusa: 403 para quem é de dentro, 404 para quem é de fora.** Quem não tem associação viva no
grupo recebe `NOT_FOUND`, igual a um grupo inexistente — não pode descobrir que a comunidade existe.
Membro ativo cujo papel não alcança a ação recebe `FORBIDDEN`: ele já está lá dentro, e não há o que
esconder. A regra é uma só no `GroupRoleGuard`, no `assertAction` do `GroupService` e do
`MembershipService` e no `assertManager` do `SeatPoolService` (`billing.manage`: comprar, ajustar,
cancelar, atribuir e retirar assento), que repetem a checagem para quando o service é chamado sem
passar pela rota.

### Status da associação (papel só vale com associação viva)

Papel é uma das duas condições; a outra é o **status** da associação. `LEFT`, `REMOVED` e
`BANNED` não
exercem nada — o papel guardado numa associação encerrada faria o ex-dono continuar
administrando. `ACTIVE` exerce o que a tabela acima permite. E a associação **pendente**
(`INVITED`, criada por `POST /groups/join`) exerce só isto:

| Ação                   | Pendente (`INVITED`) |
| ---------------------- | -------------------- |
| `group.read`           | sim                  |
| `group.update`         | não                  |
| `group.delete`         | não                  |
| `group.transfer`       | não                  |
| `group.sharing`        | não                  |
| `member.grant_reader`  | não                  |
| `invite.create`        | não                  |
| `invite.revoke`        | não                  |
| `member.list`          | não                  |
| `member.approve`       | não                  |
| `member.remove`        | não                  |
| `member.role`          | não                  |
| `member.assign`        | não                  |
| `billing.read`         | não                  |
| `billing.manage`       | não                  |
| `integration.manage`   | não                  |
| `content.publish`      | não                  |
| `content.read`         | não                  |
| `content.moderate`     | não                  |
| `offer.create`         | não                  |
| `challenge.manage`     | não                  |
| `challenge.join`       | não                  |
| `challenge.review`     | não                  |
| `post.read`            | não                  |
| `post.create`          | não                  |
| `announcement.publish` | não                  |
| `member.ban`           | não                  |
| `insights.read`        | não                  |
| `panel.overview`       | não                  |
| `panel.search`         | não                  |
| `member.file`          | não                  |
| `member.plans`         | não                  |
| `member.note`          | não                  |
| `panel.review`         | não                  |
| `benefit.read`         | não                  |
| `benefit.manage`       | não                  |

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

| Escopo        | Quem pode receber vínculo    | Quem NUNCA recebe        |
| ------------- | ---------------------------- | ------------------------ |
| `WORKOUT`     | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |
| `NUTRITION`   | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |
| `BODY`        | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |
| `HABITS`      | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |
| `GOALS`       | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |
| `MEAL_PHOTOS` | OWNER, PROFESSIONAL, CREATOR | ADMIN, RECEPTION, MEMBER |

Esta tabela é **igual em todas as linhas de propósito**, e é isso que ela tem a dizer: nenhum
papel lê nada. A equipe que recebe (`OWNER`, `PROFESSIONAL`, `CREATOR`) aparece só como "pode
receber", que não é o mesmo que "tem" — sem uma linha de `ProfessionalLink` criada pelo titular,
com aquele escopo, ativa, no mesmo grupo, a leitura responde o mesmo `NOT_FOUND` que um estranho
receberia. `ADMIN` e `RECEPTION` são equipe, mas **nunca recebem** vínculo ([ADR
043](./ADR/043-papeis-da-equipe.md)): administrar e atender não pedem dado de saúde.

Dois recortes vêm do papel e da comunidade, e só **estreitam** (#404):

- **Especialidade.** O `PROFESSIONAL` com especialidade nutrição (`GroupMembership.specialty =
NUTRITION`) só recebe `NUTRITION`, `GOALS`, `BODY` e `MEAL_PHOTOS`; `WORKOUT` e `HABITS` nunca,
  mesmo que o aluno marque. O recorte vale ao consentir, ao entrar na equipe e ao mudar a
  especialidade (os vínculos são revogados e recriados já recortados, no mesmo commit); a porta
  de leitura confere de novo. Trocar de nutrição para outra especialidade não devolve nada: o
  aluno precisa consentir de novo.
- **"Profissionais veem só quem acompanham"** (`Group.proSeeOnlyAssigned`). Ligado, o
  `PROFESSIONAL` só lê quem tem ele como responsável (`accompaniedById`), mesmo com vínculo; a
  lista, a ficha, Para revisar e Em risco seguem o mesmo filtro. O dono não é afetado.

A ADR 026 abriu a coluna para o dono e o criador: o consentimento passa a ser dado **ao entrar**
(no convite ou no código), para a equipe toda de uma vez, e não mais um profissional por vez.
Os escopos escolhidos ficam em `GroupMembership.consentScopes` e viram um vínculo para cada
pessoa ativa da equipe; quem entra na equipe depois recebe os vínculos de quem já consentiu, e
quem sai perde os seus. Reescrever o consentimento do grupo (`PUT /groups/:groupId/consent`)
substitui os vínculos da pessoa naquele grupo. `MEMBER` continua nunca lendo ninguém.

Consentir um escopo não abre outro: a porta confere `scopes: { has: scope }`, um escopo por
chamada. `hasSome` com lista casaria com tudo, e consentir treino abriria a dieta.

`MEAL_PHOTOS` ("Fotos das refeições", [ADR 038](./ADR/038-foto-da-refeicao-guardada.md), #374) é
a 6ª categoria e nunca vem junto de `NUTRITION`: quem já compartilhava a alimentação continua
mostrando só os números. A leitura devolve uma URL assinada de curta duração por foto e entra na
trilha como qualquer outra.

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
  usuário sendo membro ativo do grupo do titular; desde a #404, também `ADMIN` e `RECEPTION`
  (mesmo com vínculo antigo no banco), o admin tentando se promover ou rebaixar outro admin, e o
  papel de uma comunidade sem valor na outra.
- O cliente (`packages/api-client`) tem um espelho da tabela de ações (`ROLE_ACTIONS`), usado só
  quando a API ainda não mandou `actions`; `role-actions.test.ts` o confere contra esta doc.
- `apps/api/src/mcp/__tests__/tool-delegation.spec.ts` classifica **toda** tool MCP e reprova a
  que aceitar a associação de outra pessoa sem passar pela porta certa. Desde a #157 ele desce
  também para o service colaborador e exige a **chamada** a `assertReadable`: citar o nome da
  porta num comentário satisfazia a versão anterior, e comentário não autoriza ninguém.
- O painel do profissional (#157) é exercitado ponta a ponta em `user-isolation.spec.ts` contra
  Postgres real — sem vínculo, com escopo não consentido, com vínculo revogado e com o
  profissional demitido, todos com a **mesma** mensagem que um estranho recebe, mais o caminho
  feliz e a contagem de linhas de auditoria por escopo lido.

## Papéis da equipe (ADR 043, #404)

`ADMIN` e `RECEPTION` estão nas tabelas de cima, e o nutricionista é o `PROFESSIONAL` com
especialidade nutrição (ver "Leitura de dado de titular"). O que a ADR 043 previa e ainda não está
no código: o consentimento **por papel** na entrada (o aluno escolher o que profissionais de
treino, nutricionista e dono/criador veem, #372) e o check-in da recepção (#390). Até lá, o aluno
consente para a equipe que recebe, e a especialidade só estreita.

**Plano alimentar do profissional (#376, [ADR 045](./ADR/045-plano-alimentar-autoral.md)).**
Quem escreve é a equipe (OWNER/PROFESSIONAL/CREATOR ativo na comunidade do aluno); o plano é
do aluno. As trocas, o "comi isso" e a adesão da semana só aparecem para a equipe dentro da
leitura `NUTRITION` (porta única do ADR 014, logada em `ProfessionalAccessLog`, sem
identidade). Sem `NUTRITION`, a equipe não vê nada disso e o aviso da troca diz que ela "fica
só no seu diário". Nenhum agregado novo foi criado (o `MIN_CELL` 5 não se aplica ainda).

**Plano de treino recebido (#379).** Quem manda ou atualiza é a equipe (OWNER/PROFESSIONAL/
CREATOR ativo na comunidade do aluno) e só com `ProfessionalLink` ativo entre os dois; sem
vínculo, a rota responde como inexistente. O aluno aceita, recusa ou desfaz a recusa; nada muda
no plano dele sem aceite. Recusar não revoga o vínculo nem mexe nos consentimentos. A equipe
fica sabendo da resposta pelo aviso, sem ler o plano copiado nem a agenda do aluno. A agenda
(`PlannedSession`) é do aluno e informativa: ninguém da equipe a lê nem a marca.

**O que não muda:** papel decide ação, vínculo decide leitura; toda leitura, inclusive a negada,
vai para `ProfessionalAccessLog`; `MEMBER` nunca lê ninguém.
