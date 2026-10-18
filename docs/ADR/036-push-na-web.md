# ADR 036 — Avisos também no navegador (Web Push), com os recibos e o agrupamento que faltavam

**Status:** Accepted (Fase 9g, 18/10/2026)
**Data:** 2026-10-18

## Contexto

A ADR 033 deixou três coisas para depois:

- os recibos da Expo;
- agrupar comentários em sequência;
- push na web, porque o PWA no iOS não entregava com confiança.

Desde o iOS 16.4 o Safari entrega Web Push para o PWA instalado na tela de início. No Android e no
desktop, o Web Push funciona há anos. A Fase 9e ainda trouxe um aviso novo, "resposta do chat
pronta", que interessa a quem usa só a web.

## Decisão

1. **Web Push com VAPID**, pela lib `web-push`, ao lado do push da Expo:
   - os mesmos avisos, as mesmas preferências por tipo, o mesmo texto sem dado de saúde;
   - Perfil → Notificações ganha "Avisos neste navegador";
   - o service worker (`public/sw.js`) mostra o aviso e, no toque, só abre caminho interno (a
     mesma regra do `notificationTarget`).
2. **Endpoint só de serviço de push conhecido** (`isPushEndpoint`): `https`, sem porta, e host do
   Google, da Mozilla, da Apple ou da Microsoft. A API faz POST para o endpoint que o navegador
   entrega; sem a lista, qualquer conta logada apontaria o servidor para um endereço interno
   (SSRF).
3. **Inscrição é da conta que inscreveu por último**, no máximo 10 por pessoa; 404/410 do serviço
   apagam a inscrição. O export leva só as datas.
4. **Recibos da Expo** (`PushTicket`): cada envio aceito guarda o ticket. A cada 15 min:
   - os recibos com mais de 15 min são lidos;
   - `DeviceNotRegistered` apaga o aparelho;
   - credencial errada ou excesso de envio viram alerta no log;
   - ticket com mais de 24 h é esquecido.
5. **Comentários em sequência num aviso só** (`PendingNotice`):
   - o primeiro comentário num post avisa na hora;
   - os seguintes, numa janela de 10 min, saem juntos no fim dela ("Mais N comentários no seu
     post"), sem nada do que foi escrito;
   - a contagem é atômica: dois comentários simultâneos não mandam dois avisos.
6. Sem as três chaves `WEB_PUSH_*`, a web não oferece a opção e nada é enviado.

## Consequências

- Quem usa só a web passa a receber convites, desafios, o mural e a resposta do chat.
- O serviço de push do navegador (Google, Mozilla, Apple, Microsoft) vê o texto do aviso e o
  caminho, como a Expo, a Apple e o Google já viam no celular. Por isso o texto continua neutro.
- Duas tarefas periódicas a mais na API (recibos a cada 15 min, janelas a cada minuto), com
  `unref` e paradas no desligamento.

## Alternativas consideradas

- **Push da web pela Expo:** a Expo não entrega Web Push para PWA próprio.
- **Agrupar no aparelho** (Android `group`, iOS `thread-id`): agrupa na bandeja, mas cada
  comentário continua acordando o celular.
