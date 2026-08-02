# CLAUDE.md

Instruções para o Claude (e outros assistentes IA) trabalhando neste repositório.

> **Leitura opcional para humanos.** Este arquivo existe para ser carregado
> automaticamente por assistentes de código (Claude Code e afins) — é contexto de
> ferramenta, não documentação do produto. Se você não usa assistente, pode pular:
> tudo que vale como regra de contribuição está no
> [`CONTRIBUTING.md`](../CONTRIBUTING.md), e tudo que vale como decisão técnica
> está em [`ARCHITECTURE.md`](./ARCHITECTURE.md) e nos [ADRs](./ADR).
>
> Se você **usa** assistente: aponte-o para cá antes de abrir uma PR. As regras de
> isolamento por usuário e de prova de teste vermelho valem para código gerado
> exatamente como valem para código escrito à mão.

## Contexto rápido

Fatia é um rastreador self-hosted de nutrição e treino, multiusuário. Backend NestJS + Postgres. Frontend Next.js PWA + app Expo. Integração com IA via MCP. Detalhes em `docs/PRD.md` e `docs/ARCHITECTURE.md`.

## Antes de começar qualquer task

1. Leia `docs/PRD.md` para entender escopo e **não-escopo**. Atenção à regra de precedência da
   [ADR 013](./ADR/013-roadmap-supera-escopo-negativo-v1.md): a lista negativa do §4 vale para
   trabalho de **v1**; para trabalho de **roadmap pós-MVP**, a épica manda e o PRD registra a
   exceção. Item com issue aberta e priorizada não é fora de escopo, mesmo que a lista o cite.
2. Leia `docs/ARCHITECTURE.md` para decisões técnicas já tomadas
3. Confira as [Issues](https://github.com/ThiagoCarreiraVallim/fatia/issues) para ver onde a tarefa se encaixa (`docs/TASKS.md` tem o mapa das épicas)
4. Se vai mudar schema, leia `packages/db/prisma/schema.prisma` inteiro primeiro

## Princípios de código

### Geral

- **YAGNI > DRY > Performance** nessa ordem para a v1
- Não criar abstrações antes da segunda repetição real
- Comentar o "porquê", nunca o "o quê"
- Funções pequenas, propósito único

### TypeScript

- `strict: true` sempre
- Sem `any`. Se precisar, use `unknown` e narrow
- Tipos explícitos em fronteiras (controllers, services públicos)
- Inferência OK em locais

### NestJS

- Um módulo por domínio (`AuthModule`, `NutritionModule`, `WorkoutModule`, `ProgressModule`, `McpModule`)
- Controller → Service → Repository (Prisma)
- DTOs com `class-validator` para REST, Zod para MCP
- NUNCA aceitar `userId` como parâmetro de controller. Sempre `@CurrentUser() user`
- Services puros: recebem dados, retornam dados, não dependem de request

### Prisma

- Migrations sempre via `prisma migrate dev` em desenvolvimento
- Em produção: `prisma migrate deploy`
- Migrations destrutivas exigem ADR (`docs/ADR/`)
- Index nas colunas frequentemente filtradas (qualquer `[userId, X]`)

### Next.js

- App Router com Server Components por padrão
- Client Components só quando precisa de state/eventos
- Forms com `react-hook-form` + Zod
- Fetching no servidor preferido; TanStack Query para client-side fetches dinâmicos
- Sem `localStorage` para dados de sessão (só preferências de UI)

### Estilo de commit

Conventional Commits:

```
feat(nutrition): add log_meal MCP tool
fix(auth): expire JWT correctly on logout
chore(deps): bump prisma to 5.20
docs(mcp): clarify search_food schema
```

### Fechar issue pela PR: a palavra-chave é em INGLÊS

Tudo neste repositório é escrito em português — commits, comentários, corpo de PR. A palavra que
fecha a issue é a exceção, e é uma armadilha justamente por isso:

```
Closes #123      ✅ o GitHub fecha a issue no merge
Fecha #123       ❌ o GitHub ignora; a issue fica aberta para sempre
```

O GitHub só reconhece `close`/`closes`/`closed`, `fix`/`fixes`/`fixed` e
`resolve`/`resolves`/`resolved`. Não há equivalente em português, e **nada avisa** — a PR mergeia
verde, o board vai para Done, e a issue continua aberta.

Aconteceu em série: **20 issues entregues e mergeadas ficaram abertas** porque os corpos das PRs
diziam "Fecha #N". Só apareceu quando alguém foi conferir por que uma épica não fechava sozinha.

Escreva a linha em inglês mesmo que o resto do corpo esteja em português. Se quiser, explique em
português na frase seguinte.

## O que NÃO fazer

- ❌ Adicionar features que não têm issue aberta sem discutir
- ❌ Criar tabelas novas sem atualizar `schema.prisma` + ADR se for grande
- ❌ Hardcodar `userId` ou pular guards "temporariamente"
- ❌ Commitar `.env`, secrets, ou tokens
- ❌ Criar dependências para coisas triviais (ex: lodash para 1 função)
- ❌ Sobrepor decisões do PRD/ARCHITECTURE sem ADR (exceção prevista: ADR 013, para roadmap)
- ❌ Adicionar testes E2E na v1 (testes unitários em services críticos é suficiente)
- ❌ Refatorar código que não está sendo tocado pela task atual

## Quando em dúvida

1. Em dúvida sobre escopo: **procure a issue primeiro**. Se existe issue aberta e priorizada, está
   dentro — ver ADR 013. Se não existe, assume que está fora.
2. Em dúvida sobre arquitetura: lê ARCHITECTURE.md, se não tem resposta, pergunta antes de codar.
3. Em dúvida sobre estilo: copia do código existente mais próximo.
4. Em dúvida sobre dependência nova: prefere a opção que já está no projeto.

## Comandos úteis

```bash
# Dev
pnpm dev                    # roda api + web
pnpm --filter api dev       # só API
pnpm --filter web dev       # só Web

# Banco
pnpm db:migrate             # cria nova migration
pnpm db:push                # push schema sem migration (dev rápido)
pnpm db:studio              # abre Prisma Studio
pnpm db:seed                # roda seeds (TACO + exercises)

# Tipos / lint
pnpm typecheck
pnpm lint
pnpm format

# Build
pnpm build
```

## Estrutura de pastas (relevante)

```
apps/api/src/
├── auth/               # JWT + signup/login + MCP token mgmt
├── users/              # CRUD usuário, goals
├── nutrition/          # meals, foods, mealitems
├── workout/            # exercises, plans, sessions, sets
├── progress/           # weight logs, strength queries
├── mcp/                # MCP server module
│   ├── tools/          # uma tool por arquivo
│   └── mcp.controller.ts
├── common/             # guards, decorators, filters
└── main.ts

apps/web/src/
├── app/
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── nutrition/
│   │   ├── workout/
│   │   ├── progress/
│   │   └── profile/
│   └── api/auth/       # NextAuth ou route handlers
├── components/
│   ├── ui/             # shadcn
│   ├── nutrition/
│   ├── workout/
│   └── progress/
├── lib/
│   ├── api.ts          # fetch helpers
│   └── utils.ts
└── styles/
```

## Política de testes

**v1 (mínimo viável):**

- Unit tests para services com lógica não-trivial (cálculo de macros, agregações)
- Integration tests para guards (auth, isolamento por user)
- Sem E2E, sem snapshot, sem coverage report

**Teste obrigatório quando:**

- Mexer em qualquer guard de autorização
- Mudar lógica de cálculo de macros/totais
- Adicionar tool MCP nova

## Performance

Não é prioridade na v1. Não otimizar antes de medir. Postgres + índices em `userId` é suficiente para os primeiros milhares de usuários.

## Como pedir ajuda ao Claude

Se você é o usuário pedindo ajuda ao Claude para implementar algo:

1. Cite a issue por número
2. Mostre arquivos relevantes (não cole o repo inteiro)
3. Diga o que tentou e por que não funcionou
4. Pergunte uma coisa por vez
