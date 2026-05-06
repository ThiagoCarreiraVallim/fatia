# ADR 001 — Monorepo com pnpm + Turborepo

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

API (NestJS) e Web (Next.js) compartilham tipos (DTOs, enums) e o schema Prisma. Mantê-los em repos separados gera drift; mantê-los sem ferramenta gera builds lentos e dependências confusas.

## Decisão

Monorepo único com pnpm workspaces + Turborepo.

## Consequências

### Positivas
- Tipos compartilhados sem publish em registry
- Schema Prisma único em `packages/db`, consumido por API e scripts
- Cache de builds com Turborepo
- pnpm é rápido e gerencia bem hoisting

### Negativas
- Curva de aprendizado para quem não conhece monorepo
- CI tem que ser configurado para builds parciais (não relevante na v1, deploy é manual)

## Alternativas consideradas
- **npm workspaces:** mais lento, sem cache.
- **Repos separados com pacote npm interno:** burocrático para projeto pessoal.
- **Nx:** poderoso demais, curva mais alta. Turborepo é suficiente.
