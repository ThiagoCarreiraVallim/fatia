# ADR 013 — O roadmap pós-MVP supera o escopo negativo da v1

**Status:** Accepted
**Data:** 2026-08-01

## Contexto

O `docs/PRD.md` §4 traz uma lista de não-objetivos explícitos, escrita antes de o produto existir.
Ela cumpriu o papel dela: segurou o escopo da v1 e evitou que o projeto morresse de ambição.

O problema apareceu quando o roadmap pós-MVP foi transformado em épicas no GitHub. Três coisas
ficaram inconsistentes ao mesmo tempo:

1. **O produto passou por cima de três não-objetivos e ninguém atualizou o documento.** App nativo
   (#132), exportação de dados (#95) e instruções de execução de exercício (#43) estão entregues,
   em produção, e o PRD continua listando os três como coisas que não vamos fazer.
2. **Épicas do roadmap adotaram deliberadamente outros três.** Scanner de código de barras (#140),
   conteúdo do personal (#161, #162) e integração com wearables (#151) têm issue aberta,
   priorizada e justificada — contra uma linha que diz ❌.
3. **A seção de usuários virou ficção.** O PRD descreve "5-10 amigos, convites manuais, sem signup
   aberto". O conector foi submetido ao diretório público da Anthropic com registro dinâmico de
   cliente. Quem chega por lá é um estranho.

O `docs/CLAUDE.md` manda, na primeira instrução de qualquer tarefa: _"Leia `docs/PRD.md` para
entender escopo e não-escopo (a lista negativa é importante)"_. E depois: _"Em dúvida sobre escopo:
assume que está fora"_.

O resultado prático é o pior possível. Um agente — ou uma pessoa — que siga as instruções à risca
recusa trabalho legítimo, priorizado e com issue aberta, citando um documento desatualizado. E o
revisor que confiar no PRD bloqueia a PR com razão aparente. A contradição não estava resolvida em
lugar nenhum: nem o PRD citava as épicas, nem as épicas citavam o PRD.

## Decisão

**Precedência por origem do trabalho:**

- Trabalho de **v1** → o escopo negativo do `PRD.md` §4 manda. Continua valendo, sem exceção.
- Trabalho de **roadmap pós-MVP** → a épica manda, e o PRD registra a exceção com o número dela.

O `PRD.md` §4 passa a ter três blocos em vez de uma lista: o que continua proibido sem exceção,
o que já foi entregue (com o porquê da mudança), e o que foi adiado para o roadmap (com a issue).

Uma exceção só é válida quando existe **issue aberta e priorizada** que a assuma. Ideia solta
continua fora — não é permissão para o escopo crescer sozinho.

## Consequências

### Positivas

- Deixa de existir PR legítima que trava em review por bater na lista negativa.
- O PRD volta a descrever o produto que existe. Antes ele descrevia um produto de cinco amigos com
  convite manual, o que dava garantias erradas sobre quem consome a API.
- A regra é verificável: ou existe issue que assume a exceção, ou o item continua fora.
- Cada exceção fica registrada com o motivo, e não como esquecimento.

### Negativas

- Duas fontes de verdade sobre escopo — PRD e épicas. Mitigado por o PRD apontar a issue em cada
  exceção, então a leitura do PRD sozinha já revela onde olhar.
- Alguém pode usar isto como pretexto para abrir issue e declarar qualquer coisa "roadmap".
  A defesa é a mesma de sempre: issue precisa ser priorizada, e ADR é obrigatória para decisão
  arquitetural.

### Neutras

- O `docs/CLAUDE.md` continua mandando ler o PRD primeiro. Muda o que vai ser lido, não o hábito.

## Alternativas consideradas

- **Reescrever o PRD para descrever o produto atual.** Rejeitada: o PRD é o registro do que a v1
  se propôs a ser, e apagar isso destrói o histórico de por que o escopo foi apertado. Preferimos
  marcar a evolução a fingir que ela não houve.
- **Deixar as épicas mandarem sempre, sem tocar no PRD.** Rejeitada: mantém o documento mentindo,
  e o `CLAUDE.md` continuaria mandando ler um texto que faz recusar trabalho válido.
- **Fechar as issues que contrariam o escopo negativo.** Rejeitada: são funcionalidades priorizadas
  do roadmap, algumas centrais ao B2B. O escopo negativo da v1 não deveria decidir o produto de 2027.
