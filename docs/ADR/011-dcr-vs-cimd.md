# ADR 011 — Manter DCR em vez de adotar CIMD

- **Status:** Accepted
- **Data:** 01/08/2026
- **Contexto:** issue #170, item A6 do [checklist de submissão](../SUBMISSION_CHECKLIST.md)

## Contexto

A doc de [authentication](https://claude.com/docs/connectors/building/authentication) do
diretório de conectores recomenda, para servidores que esperam tráfego do diretório,
**CIMD** (Client ID Metadata Document) ou credenciais mantidas pela Anthropic, em vez de
Dynamic Client Registration.

O motivo é concreto: com DCR o Claude registra um cliente **novo a cada conexão nova**, e a
tabela de clientes cresce sem teto.

Não é hipótese. Medido em produção em 31/07/2026:

```
McpOAuthClient   69 linhas
```

Para um punhado de usuários. A maioria são tentativas de conexão que nunca completaram o
fluxo — cada uma deixou um registro para trás.

O Fatia já anuncia `token_endpoint_auth_methods_supported: ['none']`, que é metade da
condição para o Claude escolher CIMD. A outra metade seria anunciar
`client_id_metadata_document_supported: true`.

## Decisão

**Manter DCR**, com poda de clientes abandonados.

Adotar CIMD fica registrado como caminho conhecido, a ser reavaliado se o volume justificar.

## Por quê

**O DCR já funciona e está validado ponta a ponta.** O facade foi construído sobre ele
justamente porque o Logto não expõe DCR público (ADR 008), e o fluxo completo — registro,
PKCE S256, refresh — está coberto por teste E2E e foi confirmado contra produção, incluindo
a conexão real no Claude mobile. Trocar a fundação de autenticação às vésperas da submissão
troca um risco conhecido e medido por um desconhecido.

**O problema real do DCR é crescimento de tabela, e isso tem solução barata.** A poda
oportunista remove clientes registrados há mais de 24h que nunca chegaram a ter uma
authorization — o caso que produz as 69 linhas. Um cliente que completou o fluxo tem
authorization e sobrevive; um que nunca passou do `register` não vai passar, porque o Claude
registra de novo quando precisar.

**A recomendação da doc é para "servidores que esperam tráfego do diretório".** O Fatia
ainda não está no diretório. Se entrar e o volume crescer, a decisão se reavalia com dado
real em vez de projeção.

## Consequências

- A tabela `McpOAuthClient` para de crescer com registros mortos. O piso passa a ser o
  número de conexões que de fato completaram.
- Continuamos sem depender de infraestrutura adicional: CIMD exigiria hospedar e versionar
  um documento de metadata, com o cuidado de nunca quebrar o que já está publicado.
- Se a Anthropic passar a exigir CIMD, a mudança é localizada — o
  `oauth-discovery.controller.ts` anuncia a capacidade e o `oauth-facade.service.ts` deixa de
  criar linha no `register`. Nenhum dado de usuário é afetado.
- A janela de 24h da poda é um palpite conservador. Se aparecer usuário reclamando de
  consentimento expirado, é o primeiro número a revisar — mas a authorization em si expira
  bem antes disso, então o risco é baixo.

## Alternativas consideradas

**Adotar CIMD agora.** Alinha com a recomendação da doc e elimina o crescimento na origem.
Descartado por trocar uma fundação testada por uma não testada em cima do prazo de
submissão, para resolver um problema que a poda já resolve.

**Pedir `oauth_anthropic_creds` por e-mail para `mcp-review@anthropic.com`.** Tira a
responsabilidade da credencial de nós. Descartado por adicionar uma dependência de processo
humano no caminho crítico, e por acoplar o Fatia a um cliente específico — o servidor MCP é
aberto, e o BYO-AI (épica #163) pressupõe que qualquer cliente consiga se registrar sozinho.

**Poda por cron em vez de oportunista.** Descartado pelo mesmo motivo da poda de
authorizations: somaria `@nestjs/schedule` ao projeto por causa de duas tabelas efêmeras,
e o `register` é exatamente o momento em que a tabela cresce.
