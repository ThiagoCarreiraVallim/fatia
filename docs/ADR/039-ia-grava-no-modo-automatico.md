# ADR 039 — Modo automático: a IA grava sem pedir OK, quando a pessoa escolhe

**Status:** Accepted
**Data:** 2026-11-09
**Altera:** [ADR 022](./022-classificacao-3-camadas-do-chat.md), regra 2 (CONFIRMABLE "só após OK")

## Contexto

Pela ADR 022, toda tool que escreve (CONFIRMABLE) só roda depois que a pessoa aprova o cartão de
confirmação na conversa. É seguro, mas custa um toque por registro — e o registro diário (almoço,
água, a série que acabou) é exatamente o que a pessoa faz dez vezes por dia.

O redesign propõe três coisas que a ADR 022 não permitia: um modo "Automático" por categoria, a
troca de treino feita direto com "Desfazer" depois, e aprovar uma ação pelo cartão no topo da tela
Hoje, fora da conversa. O dono do produto decidiu adotar as três.

## Decisão

1. **Preferência por categoria, com três valores.** Perguntar antes (padrão para todos) ·
   Automático · Desligado. Categorias: Registros do dia (refeição, água, peso, passos) · Treino
   (sessão, séries, plano) · Metas · Memórias.
2. **O que nunca é automático:**
   - qualquer ação que apaga (`delete_*`);
   - as tools RESTRICTED, que continuam fora do alcance do modelo (ADR 022);
   - cobrança, consentimento e compartilhamento com a comunidade;
   - publicar ou comentar no mural da comunidade (é texto público em nome da pessoa).
3. **Toda gravação automática aparece na conversa** como cartão "Gravado", com o que foi criado ou
   o que mudou (antes → depois), e um **Desfazer**. Desfazer executa a operação inversa a partir do
   retrato guardado antes de gravar: apaga o que foi criado ou restaura os valores anteriores.
4. **Limites.** No máximo 5 gravações automáticas por resposta da IA (o mesmo teto de tools por
   rodada do agente); uma ação que mexe em mais de 10 itens de uma vez volta a pedir OK.
5. **"Desligado"** tira as tools da categoria do catálogo oferecido ao modelo naquela conversa.
6. **Aprovar fora da conversa.** O cartão no topo do Hoje (e do menu da IA) pode aprovar uma ação
   pendente, desde que mostre a **prévia completa** — as mesmas linhas da confirmação na conversa.
   O que roda continua sendo exatamente o que foi mostrado: os argumentos voltam literais e são
   conferidos antes de executar (ADR 022/023). Prévia resumida demais leva à conversa, não aprova.
7. **Avisar o profissional** de uma troca feita pela IA depende das mensagens entre aluno e equipe
   (#306) e fica fora desta ADR.
8. **O conector MCP não muda.** Quem usa a própria IA continua com a confirmação do cliente dele.

## Consequências

### Positivas

- O registro do dia a dia cai para zero toque extra para quem quiser.
- O controle continua com a pessoa, por categoria, e todo efeito é visível e reversível.

### Negativas

- O erro do modelo vira registro sem revisão: a estimativa por foto erra 20–30% na porção. O cartão
  "Gravado" com Desfazer é a mitigação, e a categoria fica em "Perguntar antes" por padrão.
- Infra nova: preferência por categoria, retrato "antes" de cada gravação automática para o Desfazer,
  operação inversa por tool, e o cartão "Gravado" nos dois clientes.
- Testes obrigatórios: categoria em Automático executa sem pausa; apagar e RESTRICTED nunca executam
  sem OK; limite por resposta; Desfazer restaura exatamente o estado anterior; aprovar pelo Hoje
  executa só os argumentos mostrados.

### Neutras

- A classificação de camadas (READ_ONLY, CONFIRMABLE, RESTRICTED) continua a mesma; muda só o que
  CONFIRMABLE faz quando a pessoa escolheu Automático.

## Alternativas consideradas

- **Um interruptor global de "IA automática".** Rejeitada: grosso demais; quem quer automático para
  água não quer necessariamente para o plano de treino.
- **Automático também para apagar.** Rejeitada: apagar não tem desfazer simples e é onde um engano
  do modelo mais custa.
- **Automático sem Desfazer.** Rejeitada: sem volta, a pessoa deixa de confiar no modo e desliga.
- **Manter a ADR 022 como está.** Rejeitada pelo dono do produto: o toque por registro pesa mais no
  uso diário que o risco, dado o Desfazer.
