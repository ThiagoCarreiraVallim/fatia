# ADR 015 — Agente de IA em Python com LangGraph, consumindo o MCP existente

**Status:** Accepted
**Data:** 2026-08-01

## Contexto

As épicas #133 (fundação de IA), #137 (nutrição com IA) e #146 (engajamento) precisam de inferência
hospedada pelo Fatia — distinta da IA _do usuário_, que já funciona: o Claude fala com o produto
pelo conector MCP e não custa nada ao projeto (ADR 006, MCP-first).

Hoje não existe nenhuma integração com provedor de IA no repositório: zero dependências, zero
módulo, nenhuma chave em `.env.example`. E o monorepo é 100% TypeScript.

Três perguntas precisavam de resposta antes de qualquer linha: em que linguagem, contra qual
provedor, e — a que mais importa — **como o agente alcança o dado do usuário**.

A terceira é de segurança, não de conveniência. O `THREAT_MODEL.md` documenta que o isolamento
entre contas é 100% garantido na aplicação NestJS, sem RLS no banco para segurar erro (ADR 010).
Se o agente ganhar acesso próprio ao Postgres, passam a existir **dois** pontos onde o filtro por
`userId` precisa estar certo, e o segundo nasce sem os testes de isolamento que protegem o
primeiro.

## Decisão

**Serviço Python separado, com LangGraph, que fala com o produto exclusivamente pelo MCP que já
existe.**

### Acesso a dado: cliente MCP com o Bearer do próprio usuário

O agente **não** tem credencial de banco e **não** tem rota privilegiada. Ele é mais um cliente do
`/mcp`, autenticado com o token do usuário em nome de quem está agindo.

```
agente (Python/LangGraph)
   │  MCP client + Bearer do usuário
   ▼
NestJS /mcp ── 87 tools ── filtra por userId ──► Postgres
```

Consequências que valem por si:

- **Um único ponto de isolamento.** Quem filtra por `userId` continua sendo o NestJS. Nenhum
  caminho de leitura novo, nenhum teste de isolamento novo a escrever para cobrir o agente.
- Reusa autenticação, rate limit por usuário (`mcp-throttler.guard.ts`) e escopo já existentes.
- Coerente com a ADR 006: se a interface MCP é completa o bastante para o Claude operar o produto
  inteiro, é completa o bastante para o nosso agente.
- Se o agente for comprometido, o estrago é limitado ao que aquele token já podia fazer.

### Linguagem: Python, fora do workspace pnpm

`apps/agent/`, com toolchain própria. O ecossistema de agentes — LangGraph, avaliação,
observabilidade de LLM — é de fato melhor em Python, e o custo é contido: o serviço fala HTTP com
o resto e não compartilha código.

O `pnpm-workspace.yaml` cobre `apps/*`, então `apps/agent` precisa ficar de fora explicitamente,
sob pena de o pnpm tentar tratá-lo como pacote Node.

### Provedor: cliente OpenAI-compatível, `base_url` por ambiente

| Ambiente        | Endpoint                                     | Custo      |
| --------------- | -------------------------------------------- | ---------- |
| Desenvolvimento | LM Studio local (`http://localhost:1234/v1`) | zero       |
| Produção        | Cloudflare AI Gateway                        | assinatura |

Os dois falam o protocolo da OpenAI, então é a mesma biblioteca e o mesmo código — muda `base_url`
e `api_key` por variável de ambiente. Nenhum `if ambiente == 'prod'` no caminho de inferência.

O que isso destrava, verificado nesta decisão: o LM Studio local serve `gemma-4-12b-qat` com
**visão funcionando** (confirmado com imagem de teste), `ornith-1.0-9b` e embeddings
`nomic-embed-text-v1.5`. Logo, **#139 (refeição por foto) é desenvolvível e testável ponta a ponta
sem gastar nada** — o que só o pipeline de produção exige credencial.

### Degradação sem provedor

Sem `AI_BASE_URL` configurada, a capacidade **degrada explicitamente** em vez de quebrar: erro
nomeado, mensagem acionável, e nenhuma tool MCP nova exposta ao Claude. O produto continua
funcionando inteiro sem IA hospedada, que é como ele funciona hoje.

## Consequências

### Positivas

- O isolamento por `userId` continua com um dono só.
- Dá para desenvolver e testar IA de graça, contra modelo local, incluindo visão.
- Trocar de provedor é trocar duas variáveis de ambiente.
- O agente pode ser desligado sem afetar nada do produto atual.

### Negativas

- **Segunda linguagem no repositório.** Lint, teste, build, imagem Docker e CI próprios. Aceito
  conscientemente pelo ganho de ecossistema; contido por o serviço ser isolado por HTTP.
- **Latência a mais.** O agente chama o MCP, que chama o Postgres, em vez de consultar direto.
  Irrelevante diante do tempo de inferência, que domina qualquer chamada de LLM.
- **O MCP vira dependência de produção do agente.** Se o `/mcp` cair, o agente cai junto — mas
  nesse cenário o produto já está fora do ar de qualquer forma.
- Uma capacidade que o MCP não exponha exige tool nova, não consulta ad-hoc. É atrito de propósito.

### Neutras

- Modelo local e modelo de produção não dão a mesma resposta. Para desenvolvimento de fluxo é
  suficiente; medição de qualidade (#138) exige o provedor real e um conjunto rotulado.

## Alternativas consideradas

- **Agente com acesso direto ao Postgres.** Rejeitada: cria um segundo ponto de garantia de
  isolamento, sem RLS no banco para segurar erro, num serviço em outra linguagem e sem os testes
  que protegem o primeiro. É exatamente o risco que a ADR 010 aceitou não ter.
- **Agente sem estado, recebendo dado no corpo da requisição.** Preserva o isolamento igualmente
  bem e é mais simples de raciocinar, mas obriga a API a montar o payload certo para cada caso de
  uso novo — e reimplementa, em outro formato, o que as 87 tools já expõem.
- **Escrever o agente em TypeScript, dentro do `apps/api`.** Evitaria a segunda linguagem e o
  serviço a mais. Rejeitada pelo ecossistema: LangGraph e as ferramentas de avaliação e
  observabilidade de LLM são mais maduras em Python, e essa diferença aparece cedo.
- **Chamar o provedor direto, sem gateway.** Rejeitada: o AI Gateway dá cache, limite de gasto,
  log e troca de modelo sem deploy — que é metade do que a #135 (custo e cota) pede.
