# ADR 026 — Consentimento por escopo ao entrar na comunidade

**Status:** Proposed
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
