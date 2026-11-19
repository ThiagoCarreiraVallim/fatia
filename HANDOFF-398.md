# HANDOFF #398 — rodada 2 (revisão adversarial)

Branch `redesign/398-painel-layout`. Banco de teste `fatia_t398`. Cada item: teste vermelho commitado antes da correção.

## Itens

1. [x] throttle do descadastro por token + página 429/5xx
2. [x] limite semanal em AnnouncementDispatch (migration 20261119100100_)
3. [x] janelas presas ao dia; binário com os dois lados >= 5; só MEMBER
4. [x] segredo forte em produção; placeholder vazio
5. [x] List-Unsubscribe one-click
6. [x] markdown do e-mail sem estragar URL
7. [x] notifiedAt = now
8. [x] vaga só depois dos destinatários
9. [x] .catch no notify do publicar agora
10. [x] mandadas inclui web push (ou rótulo)
11. [x] viaUnknown
12. [x] invalidar announcementSettings no editor
13. [x] limpar fatia:panel:* ao sair
14. [x] testes: trava paralela, injeção HTML, supressão real

Feito: testes vermelhos (ebe19374), API (cd0a32fb), web/api-client (5dec179d), docs. Falta: prettier, merge origin/main, checks completos, apagar este arquivo.
