# ADR 026 — Consentimento por escopo ao entrar na comunidade

**Status:** Accepted
**Data:** 2026-10-13

## Contexto

Hoje (ADR 014, `docs/PERMISSIONS.md`) **papel governa administração e consentimento governa
leitura**: o `OWNER` nunca lê dado individual de saúde, só agregados com supressão de célula pequena
(`insights/`, `MIN_CELL=5`). O único caminho de leitura cruzada é o `ProfessionalLink`, concedido
pelo aluno a um `PROFESSIONAL`, verificado em `professional-access.service.ts#assertReadable` e
auditado em `ProfessionalAccessLog`.

O dashboard da academia/influencer precisa mostrar dados dos membros. Dado de saúde é dado sensível
(LGPD art. 11): não pode virar efeito colateral de entrar num grupo.

## Decisão

1. **Ao entrar na comunidade, o membro vê uma tela de consentimento** com os escopos
   (`WORKOUT`, `NUTRITION`, `BODY`, `HABITS`, `GOALS`) e escolhe quais compartilha com a equipe.
   Nenhum vem marcado por padrão. Recusar todos não impede a entrada.
2. **Os escopos aceitos viram `ProfessionalLink`** para cada membro ativo da equipe (`OWNER`,
   `PROFESSIONAL`, `CREATOR`), reaproveitando a máquina existente. Quem entrar depois na equipe
   recebe link com os mesmos escopos; quem sair tem o link revogado.
3. `canReceiveLink` passa a aceitar `OWNER` e `CREATOR` além de `PROFESSIONAL`. A matriz em
   `sharing/permissions.ts`, `docs/PERMISSIONS.md` e `permission-matrix.spec.ts` mudam juntas.
4. **O dashboard mostra individual só com link ativo** no escopo pedido (via `assertReadable`, com
   log); para quem não consentiu, só agregados com a supressão de célula pequena.
5. O membro **revoga a qualquer momento** pelo app (tela de compartilhamento já existente) e a
   revogação vale na hora. O registro do aceite fica em `GroupMembership.consentScopes`.
6. `statsOptIn` (participação nas estatísticas agregadas) é uma escolha separada e também opt-in.

## Consequências

### Positivas

- O dashboard tem dado útil sem quebrar o princípio "consentimento governa leitura".
- Nenhuma máquina nova de autorização: só um novo caminho de criação do link.

### Negativas

- Um link por par (membro, pessoa da equipe): comunidades grandes geram muitas linhas.
  Aceitável — `ProfessionalLink` é estreito e indexado.

### Neutras

- ADR 014 continua válida; esta ADR acrescenta um momento de concessão, não muda o modelo.

## Alternativas consideradas

- **Só agregados:** rejeitado — não entrega o que o dono precisa para acompanhar o membro.
- **Entrar implica compartilhar tudo:** rejeitado — consentimento genérico para dado sensível não
  atende a LGPD e destrói a confiança no app.

## Atualização — decisões da implementação (2026-10-15)

- A tela de consentimento aparece **no convite** (`/c/<token>`), **na entrada por código** e ao
  **editar** o compartilhamento na tela da comunidade. Mostra quem da equipe vai ver cada escopo.
- **Reescrever o consentimento da comunidade substitui** os vínculos da pessoa naquela comunidade;
  o ajuste fino por pessoa da equipe (`grant_data_sharing`) continua existindo depois.
- **O leque roda nos dois sentidos:** quando alguém entra (ou é promovido) na equipe, recebe os
  vínculos de todo membro que já consentiu; quando sai, os vínculos dele são revogados.
- Entrada com aprovação guarda o consentimento na membership pendente; os vínculos só nascem na
  aprovação.
- `assertReadable` passa a usar `canReceiveLink` (antes estava fixo em `PROFESSIONAL`). `MEMBER` e
  `ADMIN` continuam nunca lendo; toda leitura continua registrada.

## Atualização — mudar papel pelo painel (2026-10-17, Fase 6)

O dono passou a mudar o papel de quem já está dentro (`PATCH /groups/:id/members/:membershipId`,
ação `member.role`, só `OWNER`). Os vínculos seguem a mesma regra do leque, no mesmo commit da troca:

- **De membro para a equipe** (profissional ou criador): a pessoa passa a receber o que cada membro
  já consentiu à comunidade, como quem entra na equipe por convite.
- **Da equipe para membro:** os vínculos que ela recebia ali são revogados
  (`revokedReason = role_changed`); `assertReadable` passa a responder 404 na requisição seguinte.
- **Entre papéis de equipe:** nada muda nos vínculos.
- O que a própria pessoa compartilha com a equipe não muda em nenhum dos casos, e o dono não muda de
  papel por aqui: transfere.

O consentimento foi dado "à equipe", e a tela mostra quem é a equipe no momento. Quem entra depois
recebe o mesmo que quem já estava — a pessoa vê a equipe atual e o registro de acessos na tela da
comunidade, e pode mudar ou cortar quando quiser.

## Atualização — escopos obrigatórios da comunidade (2026-10-21)

O dono passa a poder escolher, ao criar a comunidade (e depois, no perfil dela), o que **quem entra
como membro precisa compartilhar** (`Group.requiredSharingScopes`). Nada obrigatório é o padrão, e
as comunidades que já existiam continuam assim.

- **Vale no servidor**, em `sharing/consent-scopes.ts`: entrar pelo código (aberta ou com aprovação)
  e aceitar convite sem um escopo obrigatório respondem 409 com o nome do que falta, sem gravar
  pedido nem gastar o convite. A tela trava os toggles, mas o MCP chega às mesmas portas.
- **Só para `MEMBER`.** A equipe é quem recebe; um personal convidado não deve abrir o próprio
  treino para trabalhar na academia. O cartão do convite de equipe mostra a lista vazia.
- **Tirar um obrigatório que já se compartilha é recusado** nas três portas do titular: o
  consentimento à comunidade, o ajuste por pessoa (`grant_data_sharing`) e a revogação de um vínculo.
  Para parar de compartilhar, a pessoa sai da comunidade — sair continua livre e revoga tudo, então o
  consentimento segue revogável (LGPD), só que junto com a participação.
- **Quem já está dentro não é cobrado** quando o dono passa a exigir algo novo: a exigência vale
  para entradas dali em diante, e mexer no consentimento depois não vira porta para cobrar o antigo.
  O que a pessoa já compartilhava e passou a ser obrigatório fica travado. Pedido pendente feito
  antes da mudança é aprovado com o que tinha. É a regra mais simples sem expulsar ninguém nem
  mudar consentimento sem ato do titular.
