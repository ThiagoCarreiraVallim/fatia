# ADR 002 — MCP server no mesmo processo da API

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

A integração com Claude se dá via MCP. Existem duas formas naturais de hospedar:
1. Servidor MCP separado, com seu próprio processo, falando com a API via HTTP interno
2. Servidor MCP como módulo dentro do mesmo processo NestJS

A v1 atende ~10 usuários, ~50 chamadas/dia por usuário. Volume baixo.

## Decisão

MCP roda no mesmo processo da API NestJS, como um `McpModule`. Endpoint exposto em `/mcp`.

## Consequências

### Positivas
- Compartilha guards, services, conexão com banco, logs
- Auth unificada: o `McpAuthGuard` popula `req.user` igual o `JwtAuthGuard`
- Deploy único — um container, um `docker compose up`
- Lógica de negócio chamada diretamente, sem HTTP intermediário
- Tipos compartilhados nativamente (sem OpenAPI/RPC)

### Negativas
- Se MCP precisar escalar diferente da API, refator obrigatório
- Bug crítico em uma feature derruba ambas as interfaces
- Consumo de memória do servidor MCP soma com o resto da API

### Neutras
- Mesmo logging stack para ambos
- Mesma estratégia de rate limit aplicável a ambos com configs distintas

## Alternativas consideradas

- **Servidor MCP separado:** rejeitado. Adicionaria um container, autenticação inter-serviço, complexidade de deploy. Otimizar prematuramente para escala que talvez nunca venha.
- **MCP via biblioteca standalone (sem framework):** rejeitado. Perderíamos toda a infra de DI, guards, validação que o Nest já oferece.
