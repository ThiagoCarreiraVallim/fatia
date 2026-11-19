# ADR 048 — Sem chat entre equipe e aluno: a conversa é no WhatsApp

**Status:** Accepted
**Data:** 2026-11-19
**Fecha:** #306 (mensagens entre profissional e aluno) e a etapa 2 da #338 (mensagens pela Cloud
API da Meta), enquanto esta ADR valer.

## Contexto

O acompanhamento de academia e personal no Brasil já acontece no WhatsApp. A #306 previa um chat
1:1 dentro do Fatia (texto, áudio, foto, mensagem em massa, push, lido/não lido, bloqueio e
denúncia), e a #338 etapa 2 previa mandar mensagens pela Cloud API oficial da Meta. As duas
trazem um dado que o Fatia não tem hoje: **mensagem de uma conta para outra**. Isso abriria um
vetor novo no THREAT_MODEL (conteúdo de terceiro, assédio, moderação, mídia entre contas, export
e exclusão de uma conversa que pertence a duas pessoas), além de custo por conversa na Meta.

O "Para revisar" do painel (#399) precisava decidir como a equipe responde a um treino feito.

## Decisão

1. **Não existe chat entre contas no Fatia.** A conversa entre equipe e aluno acontece no
   WhatsApp: o painel abre `wa.me` com o número que o aluno informou e autorizou ("equipe pode me
   chamar", #387) e um texto pronto. O Fatia não guarda a conversa nem sabe se ela aconteceu.
2. **O único texto da equipe para o aluno é o comentário da sessão feita** (`SessionFeedback`,
   #399/#303): uma reação (💪🔥👏❤️) e/ou até 500 caracteres, **um por pessoa da equipe,
   sessão e comunidade**, editável por quem escreveu. Só quem tem `WORKOUT` liberado pelo aluno comenta
   (`assertReadable`, com o log de acesso). O aluno lê no histórico do treino e recebe um aviso;
   **não responde no app** — a resposta vai pelo WhatsApp.
3. **Comentário por exercício fica para depois** (melhoria futura da #303); hoje é por sessão.
4. **Nenhuma tool MCP manda texto a outra conta.** O comentário aparece, só leitura, no
   `get_workout_session` de quem recebeu.
5. Voltar a ter chat (ou a Cloud API) exige ADR nova que substitua esta.

## Consequências

### Positivas

- O THREAT_MODEL não ganha o vetor "mensagem entre contas": não há fio de conversa, mídia entre
  contas, mensagem em massa, bloqueio nem denúncia a moderar.
- O comentário é unidirecional, curto e preso a uma sessão que o aluno já compartilhou: herda o
  isolamento do `WORKOUT` e some quando o aluno sai da comunidade ou apaga a conta.
- Sem custo da Cloud API e sem modelo de mensagem para aprovar na Meta.

### Negativas

- O histórico da conversa fica fora do Fatia: a equipe não vê no painel o que já foi falado.
- Quem não informa o telefone (ou não autoriza) só recebe o comentário da sessão.

### Neutras

- A etapa 1 da #338 (links `wa.me` com texto pronto) continua valendo e é o caminho principal.

## Alternativas consideradas

- **Chat 1:1 no app (#306):** é o centro de concorrentes como o Ekklo, mas duplica o WhatsApp que
  o público já usa e traz moderação, mídia entre contas e exclusão de dado compartilhado.
- **Cloud API da Meta (#338 etapa 2):** mensagem oficial, mas paga por conversa, com opt-in e
  modelos aprovados; não se justifica antes do piloto.
- **Aluno responder o comentário no app:** vira um chat por outra porta; a resposta vai pelo
  WhatsApp.
