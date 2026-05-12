# ADR 003 — Auth dupla: JWT (web) + Bearer Token (MCP)

**Status:** Superseded by ADR 008  
**Data:** 2026-05-06

> **Esta ADR está superseded pela ADR 008.** A decisão original de fazer auth manual com JWT + Bearer estático foi revertida quando descobrimos que conectores remotos no Claude exigem OAuth 2.1 conforme spec MCP. Adotamos Logto como provider único. Mantenho este documento como histórico do raciocínio inicial.

---

## Contexto

Web e MCP têm modelos de uso diferentes. Web é sessão humana com expiração natural. MCP é credencial de máquina, configurada uma vez e usada por meses.

## Decisão

Duas estratégias de auth:

- **Web:** JWT em cookie httpOnly, expiração 7 dias, refresh por re-login
- **MCP:** Bearer token de 32 bytes random, hasheado com argon2 no banco, sem expiração mas revogável

Cada usuário pode ter múltiplos tokens MCP (um por dispositivo).

## Consequências

### Positivas

- UX adequada para cada caso: web pede login periódico, MCP funciona até ser revogado
- Tokens MCP revogáveis individualmente sem afetar a sessão web
- Hash + label permite usuário ver "iPhone do Thiago — usado há 2 dias"

### Negativas

- Dois fluxos de auth para manter
- Tokens longos exigem storage seguro pelo usuário

### Neutras

- Ambos populam `req.user` da mesma forma; controllers e services não precisam saber de qual veio

## Alternativas consideradas

- **JWT único para tudo com refresh longo:** rejeitado. Refresh tokens em cliente MCP é complicado.
- **OAuth2 dinâmico:** ideal a longo prazo, overkill para v1 com 10 usuários conhecidos.
