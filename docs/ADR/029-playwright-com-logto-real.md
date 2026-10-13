# ADR 029 — Testes de interface com Playwright e login real no Logto

**Status:** Proposed
**Data:** 2026-10-13

## Contexto

`docs/CLAUDE.md` diz "❌ Adicionar testes E2E na v1". Não há Playwright no repositório, nem usuário
de demonstração, e `docs/LOCAL_AUTH.md` registra que não existe bypass de autenticação.

O novo direcionamento inclui uma revisão completa da interface, e a regra combinada é ver a tela
**antes e depois de cada mudança**. Isso precisa ser reproduzível por qualquer pessoa, não um print
manual.

## Decisão

1. **Playwright entra no repositório** como pacote de workspace `e2e/`, com dois usos:
   - `pnpm ui:snap <etapa>` — percorre as rotas em viewport de celular e de desktop e salva
     screenshots em `e2e/screenshots/<etapa>/` (fora do git);
   - specs de fluxo crítico (registrar refeição, treino, reset de senha, entrar em comunidade).
2. **Sem bypass de autenticação.** O Playwright faz login real no Logto local uma vez
   (`auth.setup.ts`) e reaproveita a sessão (`storageState`). Nenhum código de produção ganha
   atalho de login.
3. **O Logto passa a ser configurado por código**: `scripts/logto-bootstrap.ts` usa a Management
   API para criar apps, recurso da API, experiência de login (e-mail + senha, cadastro, esqueci a
   senha), conector de e-mail e o usuário demo. Isso também tira do clique manual a configuração
   descrita em `LOCAL_AUTH.md`.
4. **Dados de demonstração** por `pnpm db:seed:demo`, só para ambiente local/CI.
5. Supera o item "sem E2E na v1" do `docs/CLAUDE.md`. Testes unitários continuam sendo a base; E2E
   cobre só o que só se vê na tela integrada.

## Consequências

### Positivas

- Mudanças de UI chegam à revisão com antes/depois comparável.
- Ambiente local reproduzível sem clique no console do Logto.

### Negativas

- Job de CI mais lento (Postgres + Logto + API + web). Por isso entra como job separado.

### Neutras

- O Chromium usado é o pré-instalado no ambiente quando disponível.

## Alternativas consideradas

- **Bypass `DEV_AUTH`:** rejeitado — código de bypass de autenticação é risco permanente para
  ganhar alguns segundos em teste.
