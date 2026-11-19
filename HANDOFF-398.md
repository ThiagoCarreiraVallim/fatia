# HANDOFF #398 — rodada 2 (revisão adversarial)

Branch `redesign/398-painel-layout`. Banco de teste `fatia_t398`. Cada item: teste vermelho commitado antes da correção.

## Itens

1. [ ] throttle do descadastro por token + página 429/5xx
2. [ ] limite semanal em AnnouncementDispatch (migration 20261119100100_)
3. [ ] janelas presas ao dia; binário com os dois lados >= 5; só MEMBER
4. [ ] segredo forte em produção; placeholder vazio
5. [ ] List-Unsubscribe one-click
6. [ ] markdown do e-mail sem estragar URL
7. [ ] notifiedAt = now
8. [ ] vaga só depois dos destinatários
9. [ ] .catch no notify do publicar agora
10. [ ] mandadas inclui web push (ou rótulo)
11. [ ] viaUnknown
12. [ ] invalidar announcementSettings no editor
13. [ ] limpar fatia:panel:* ao sair
14. [ ] testes: trava paralela, injeção HTML, supressão real
