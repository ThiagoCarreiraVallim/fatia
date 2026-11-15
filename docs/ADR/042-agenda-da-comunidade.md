# ADR 042 — Agenda da comunidade: informativa, sem reserva, vaga ou presença

**Status:** Accepted
**Data:** 2026-11-14
**Revê:** o item "agenda de aulas" do não-objetivo "Ser o sistema de gestão da academia" (PRD §5)

## Contexto

O PRD §5 diz que o Fatia não é o sistema de gestão da academia — "matrícula, cobrança de
mensalidade, catraca, agenda de aulas" — e que o complementa, sem substituir.

O redesign desenha uma agenda da comunidade (#397; pranchas `Pn-39*`, `Pn-M5`, `Cm-23*`, `Cm-24*`
e `Al-H1b`): a equipe publica aulas e eventos, o aluno vê a semana, marca **"Vou"**, recebe o
lembrete e, depois da aula, registra o treino com um toque ("Registrar a aula · 60 min"). Não há
reserva, limite de vagas nem controle de presença.

O que o sistema de gestão faz com a agenda é **operar a academia**: vender e reservar vaga, lista
de espera, check-in na catraca, falta que gera cobrança. O que o canvas pede é **avisar e
motivar**: saber que tem aulão às 19h e lembrar de ir. São coisas diferentes, e o não-objetivo
existe para barrar a primeira.

## Decisão

1. **A agenda da comunidade entra, e é informativa.** A equipe cria, edita, cancela e repete
   aulas e eventos (presencial ou online); o membro vê, filtra e marca "Vou".
2. **"Vou" é intenção, não reserva.** Não há limite de vagas, lista de espera, confirmação da
   equipe, nem consequência de faltar. A equipe vê **quantos** marcaram "Vou" (contagem, com
   `MIN_CELL` quando virar agregado no painel), e a lista nominal só de quem marcou — que é a pessoa
   se mostrando à própria comunidade, como no mural.
3. **Presença não é registrada pela equipe.** O que fica é o treino que **a pessoa** registra
   depois da aula (cartão do Hoje), como qualquer treino dela. A equipe vê esse treino só com a
   categoria `WORKOUT` consentida (ADR 026). O check-in por QR na recepção (#390) é outra coisa:
   visita registrada pela própria pessoa, sem catraca.
4. **Continua fora:** venda e reserva de vaga, lista de espera, catraca, cobrança por aula, falta e
   integração com o sistema de gestão (Mapa 4.35, fora da história 1).
5. **MCP:** leitura da agenda e marcar/desmarcar "Vou" como tools do aluno (#397). Criar e editar
   aula é administração da comunidade e fica fora do MCP (PRD §3.5, #343).
6. O PRD §5 muda no mesmo PR: "agenda de aulas" sai da lista do sistema de gestão, com a ressalva
   de reserva, vaga e presença.

## Consequências

### Positivas

- A comunidade ganha um motivo de abrir o app toda semana, alinhado ao que retém (constância e
  vínculo, PRD §1), sem disputar com o sistema que a academia já paga.
- "Registrar a aula" liga a agenda ao registro de treino, que é o produto.

### Negativas

- Dado novo: aula/evento e "Vou" por pessoa (migração na #397, com export, exclusão e isolamento).
- A equipe vai pedir vagas e lista de presença; a resposta é esta ADR.

### Neutras

- A agenda de treinos do aluno (`Al-T24`, #379) é outra: é o plano dele no calendário, também
  informativa.

## Alternativas consideradas

- **Manter a agenda fora (PRD atual).** Rejeitada: a comunidade continuaria avisando aula pelo
  WhatsApp, fora do Fatia, e o "Registrar a aula" não existiria.
- **Agenda com reserva e vagas.** Rejeitada: é exatamente o sistema de gestão que o PRD recusa, com
  cobrança e falta logo atrás.
- **Presença marcada pela equipe.** Rejeitada: vira chamada, e a equipe passaria a registrar dado
  de treino da pessoa sem o consentimento por categoria.
