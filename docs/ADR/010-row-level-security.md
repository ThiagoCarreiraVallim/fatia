# ADR 010 — Row-Level Security no Postgres: não agora

**Status:** Accepted
**Data:** 2026-07-30

## Contexto

A épica #38 quer transformar o Fatia num Custom Connector oficial do Claude. Isso muda a
natureza do risco: hoje a instância hospedada tem um punhado de usuários conhecidos; depois da
submissão, qualquer pessoa que ache o Fatia no diretório do Claude vira tenant de um único
Postgres cheio de dados de saúde de estranhos.

Hoje o isolamento multi-tenant é **100% na camada de aplicação** — todo service filtra por
`userId`, e a auditoria da issue #92 confirmou que não há query escapando (matriz em
[`docs/THREAT_MODEL.md`](../THREAT_MODEL.md)). O ponto fraco é estrutural, não pontual: **um
único `where` esquecido num service novo vaza dado, e o banco não tem como segurar.**

Postgres Row-Level Security (RLS) resolveria isso no nível certo — políticas por tabela que o
banco aplica independentemente do que a aplicação pediu. A pergunta desta ADR é se adotamos
agora, como defesa em profundidade.

## Decisão

**Não adotar RLS agora.** Manter o isolamento na aplicação, sustentado por testes que falham
alto, e reavaliar quando um dos gatilhos abaixo acontecer.

O que fica no lugar de RLS:

1. `apps/api/src/common/__tests__/user-isolation.spec.ts` — 50 casos contra Postgres real,
   semeando como user-A e tentando ler, editar e apagar como user-B em todos os domínios.
2. `apps/api/src/mcp/__tests__/tool-user-scoping.spec.ts` — garante estruturalmente que
   nenhuma tool ou controller aceita identidade de usuário por input.
3. Threat model documentado, com a lista explícita do que **não** está protegido.

### Gatilhos para reabrir

- Um incidente real de vazamento entre usuários.
- Contribuidor externo com commit em service de domínio (hoje o repo é OSS mas o fluxo de
  escrita é de um mantenedor).
- Necessidade de conformidade que exija controle no nível do dado (auditoria formal, contrato
  empresarial).
- Adoção de SQL cru (`$queryRaw`) em qualquer caminho de leitura de dado de usuário — aí a
  garantia da aplicação deixa de ser uniforme.

## Consequências

### Positivas

- Zero complexidade nova no caminho de conexão. O Prisma continua usando o pool como está.
- Sem risco de quebrar produção atrás de **pgbouncer em transaction pooling**, que é como a
  instância roda hoje. Esse é o argumento decisivo: RLS com Prisma exige `SET LOCAL
app.current_user_id` dentro de cada transação, e o código já tem cicatriz desse ambiente —
  `workout-session.service.ts` documenta que transação interativa "falha de forma consistente"
  atrás do pooler. Introduzir uma dependência de estado por sessão nesse cenário troca um risco
  teórico por uma quebra provável.
- Migrations e seeds continuam simples (RLS exige `BYPASSRLS` ou role separada para migrar e
  para semear o catálogo TACO).

### Negativas

- **A garantia de isolamento continua sendo disciplina de código, não invariante do banco.** Um
  service novo que esqueça o `userId` vaza, e só o teste pega — se o autor escrever o teste.
- Não há defesa contra um caminho que use SQL cru sem escopo.
- Reintroduzir RLS depois é mais caro do que nascer com ela: exige revisar cada tabela e cada
  fluxo de migration/seed já existente.

### Neutras

- O schema já está pronto para RLS quando a hora chegar: toda tabela de dado de usuário tem
  coluna `userId` com índice composto `[userId, X]`, e o cascade a partir de `User` está
  declarado. Não há refactor de modelagem pendente — só a política e o plumbing de sessão.

## Alternativas consideradas

- **RLS com `SET LOCAL app.current_user_id` por transação.** A abordagem canônica com Prisma:
  envolver cada request numa transação e setar a variável de sessão que as políticas leem.
  Rejeitada pelo conflito com pgbouncer em transaction pooling descrito acima, somado ao custo
  de passar toda leitura a rodar dentro de transação explícita.

- **RLS com uma conexão/role por usuário.** Isolamento mais forte, mas inviável: exigiria um
  pool por tenant, o que não escala para um conector público de crescimento aberto.

- **Middleware do Prisma injetando `userId` em todo `where` automaticamente.** Atraente por ser
  transversal, mas frágil: não cobre `include` aninhado nem agregações de forma confiável, e
  torna implícito exatamente o que hoje é explícito e auditável. Deixaria o código _parecendo_
  seguro sem a garantia do banco — o pior dos dois mundos.

- **Adotar RLS só nas tabelas de maior impacto** (`Meal`, `WeightLog`). Rejeitada por criar dois
  modelos mentais no mesmo schema: um leitor não saberia, sem consultar, se determinada tabela
  está protegida pelo banco ou pela aplicação.
