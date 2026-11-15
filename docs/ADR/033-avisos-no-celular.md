# ADR 033 — Avisos no celular pela Expo, sem dado de saúde

**Status:** Accepted (Fase 8c, 18/10/2026) — complementada pela [ADR 036](./036-push-na-web.md): recibos, agrupamento e push na web
**Data:** 2026-10-18

## Contexto

Com a Fase 8 a comunidade passou a ter coisas que acontecem sem a pessoa estar olhando: um desafio
novo, o fim de um desafio em que ela entrou, um comentário no post dela, a equipe removendo o que
ela publicou, um convite, a aprovação do pedido de entrada. Sem aviso, ela só descobre quando abre
o app. O app nativo já usa `expo-notifications` para o aviso local do fim do descanso (#182), e o
PRD registra que o PWA não entrega push confiável no iOS (#148).

Três riscos:

- **Tela bloqueada.** O aviso aparece para quem pegar o celular. Dado de saúde, posição em ranking
  de aderência ou o texto de um post ficariam expostos ali.
- **Destino do toque.** O aviso carrega um caminho para abrir. Se o app seguisse qualquer URL, um
  aviso forjado ou um bug no servidor levaria a pessoa para fora do app.
- **Aparelho trocado de dono.** O mesmo celular pode ser usado por outra conta depois de sair; os
  avisos da conta anterior não podem continuar chegando ali.

## Decisão

1. **Entrega pela API HTTP da Expo, sem SDK.** `PushService` faz o POST em
   `exp.host/--/api/v2/push/send` em lotes de 100, com `EXPO_ACCESS_TOKEN` opcional e timeout de
   10 s. Sem `PUSH_ENABLED=true` não envia nada (dev e testes), como o e-mail sem
   `MAIL_SMTP_URL`. Ticket `DeviceNotRegistered` apaga o aparelho. Os recibos (segunda etapa da
   Expo) ficam de fora: o caso útil deles, token morto, o ticket já cobre.
2. **Aparelho é da conta que registrou por último.** `UserDevice.token` é único; registrar um
   token que estava em outra conta o passa para quem registra. Até 10 aparelhos por pessoa (sai o
   que está há mais tempo sem abrir o app). Sair da conta no app apaga o aparelho; a web lista os
   celulares e tira qualquer um.
3. **Preferência por tipo, ligada por padrão.** `COMMUNITY` (convite para a conta do e-mail,
   pedido de entrada para o dono, entrada aprovada), `CHALLENGES` (desafio novo para os membros
   ativos menos quem marcou; fim do desafio para quem participou), `FEED` (comentário no meu post)
   e `MODERATION` (a equipe removeu meu post ou comentário). Sem linha gravada, o tipo está ligado;
   o celular só recebe se a pessoa ligou os avisos nele, o que já é o opt-in do sistema.
4. **Texto sem dado sensível.** O aviso leva o nome da comunidade, o apelido ou o nome de quem
   agiu e o título do desafio. Nunca dado de saúde, posição no ranking nem o texto do post ou do
   comentário. Os textos moram juntos em `sharing/community-notices.ts`.
5. **Só para quem ainda está lá.** Comentário e remoção avisam o autor só se a associação dele
   está ativa; ninguém é avisado da própria ação; remover de novo o que já estava removido não
   avisa outra vez.
6. **Destino conferido no app.** `data.url` é um caminho interno; o app passa por
   `notificationTarget`, que só aceita caminho de uma tela conhecida (ou `/c/<token>`) e recusa
   esquema, `//`, `?` e rota desconhecida.
7. **Não atrasa nem derruba quem agiu.** `NotificationService.notify` dispara em segundo plano;
   erro vira log. `drain()` espera os pendentes nos testes e no desligamento da API.

## Consequências

- O aviso é complemento: perder um (rede, Expo fora, permissão negada) não perde nada da
  comunidade, que continua no app.
- Comentários em sequência no mesmo post geram um aviso cada (o limite é o de 60 comentários por
  hora por pessoa). Agrupar fica para quando houver queixa.
- A web não recebe push: o PWA no iOS não entrega com confiança. Ela mostra as mesmas chaves e os
  celulares cadastrados.
- O token do aparelho é dado pessoal: some com a conta (cascata) e não sai no export, que leva só
  a plataforma e as datas.
- Produção precisa de `PUSH_ENABLED=true` no compose e do projeto EAS (`EAS_PROJECT_ID`) no build
  do app; sem o projeto, o app diz que esta versão não recebe avisos.

## Emenda: lembretes, tipos novos e silêncio noturno (#389, 2026-11-15)

As pranchas `Al-V2`…`Al-V4` e `Ex-06` mudaram três pontos da decisão acima; onde a issue e a
prancha divergiram, valeu a prancha.

- **Treze tipos, em três grupos.** Entraram `PLAN_RECEIVED`, `ASSESSMENT_REQUESTED`,
  `QUESTIONNAIRE` ("Da sua equipe", que só aparece para quem está numa comunidade com equipe e
  leva o nome de quem atende), `ANNOUNCEMENTS`, `SCHEDULE`, `SCHEDULE_REMINDER` (Comunidade),
  `BIRTHDAY` (Opcional) e `REMINDERS` (os lembretes pessoais, sem chave própria: cada lembrete
  liga e desliga o seu). O enum ganhou os valores agora; quem **emite** cada tipo novo chega com a
  tela dona dele (plano recebido, #383 avaliação, #391 questionário, #394 comunicados, #397
  agenda). Até lá a chave existe e nada é enviado por ela.
- **O item 3 deixa de valer para o Opcional.** `BIRTHDAY` nasce desligado: sem linha gravada,
  não envia (`OPT_IN_KINDS`). Os outros continuam ligados por padrão.
- **Silêncio noturno.** `User.quietHoursEnabled/quietFrom/quietTo` (padrão ligado, 22:00–07:00,
  no fuso da pessoa). Dentro da janela o push não sai, mas o aviso continua indo para a central
  do sino (#373). A resposta do chat (`CHAT`) ignora o silêncio: a pessoa acabou de pedir.
- **Avisos agrupados sem conteúdo** (`Ex-06`): a novidade da comunidade sai como "5 novidades em
  <comunidade>" / "Toque para ver."; o comentário no mural mantém "Mais N comentários no seu
  post". "Sua denúncia foi revisada pela equipe" avisa quem denunciou, pelo tipo `MODERATION`.
- **Lembretes pessoais** (`Reminder`): água, refeição, peso, treino e passos, por intervalo
  ("a cada 2 h, das 8h às 20h") ou horários fixos, com os dias da semana. Quem envia é o
  **servidor** (`ReminderJob`, a cada minuto, no fuso da pessoa), não o aparelho: assim o mesmo
  lembrete chega ao celular e ao navegador, respeita o silêncio e **não sai se já foi feito**
  (água na meta ou registrada no intervalo, a refeição daquele horário, o peso do dia, o treino
  começado, os passos acima da meta). Até 12 lembretes por dia e 30 regras por pessoa. O texto não
  tem número ("Hora da água", "Hora do almoço"); vários no mesmo minuto viram "2 lembretes agora".
  O lembrete de hábito (`HABIT`, `Al-V3c`) tem o valor no enum e é recusado pela API até os
  hábitos existirem (#390).
- **A tela de Notificações não lista mais os celulares** nem tem a chave "Avisos neste celular":
  a prancha não mostra. Ligar os avisos virou o "Liberar" da faixa "Notificações bloqueadas" em
  Lembretes; desligar é pelo sistema (ou saindo da conta, que apaga o aparelho).
