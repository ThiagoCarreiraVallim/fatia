# HANDOFF #386 — correções da revisão adversarial (a partir de e98d0d8f)

Worktree `.claude/worktrees/386-plano`, branch `redesign/386-plano`. Não fazer push nem PR. Apagar no commit final.
Cada item: teste primeiro, visto falhar SEM a correção.

```bash
export DATABASE_URL=$(grep -E '^DATABASE_URL=' /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t386\1#')
(cd apps/api && npx jest src/billing)
```

## Checklist

- [x] 1. Apagar conta cancela no Asaas também o TRIALING; `encerrarAntesDeApagar` → inglês
- [x] 2. Teste sem pagamento: cancela no provedor e EXPIRED (idempotente); checkout cancela toda assinatura viva no provedor; webhook antigo não mexe na nova
- [x] 3. cancel() limpa paymentUrl; vivaNaWeb sem link velho; EXPIRED / teste cancelado vencido oferecem checkout de novo; ACTIVE cancelada depois do PAYMENT_CREATED
- [x] 4. Teste na web (qualquer forma): paga a 1ª fatura até o fim do teste; cartão recebe DUE_SOON/DUE_TODAY; página de pagamento acessível no teste
- [x] 5. Fim do programa um dia depois (grant-group) + fixture
- [x] 6. "Hoje" do aviso no fuso da pessoa (Cuiabá, Rio Branco, EUA)
- [x] 7. Aviso de fim do teste da loja: manter, sem preço/link/pagamento do Fatia, só "cancele na loja" com deep link; registrar decisão nos docs
- [x] 8. grant-group/grant-pro/grant-seat recusam produção sem `--i-know-this-is-production`, imprimem o que muda
- [ ] 9. Reserva do teste amarrada ao Asaas (libera se falhar, compensa se o banco falhar), trava por pessoa contra duplo envio
- [x] 10. Fuso inválido não derruba a rodada (try/catch + fallback); validar fuso no update-me.dto
- [ ] 11. Docs: limites do "um teste por pessoa"
- [ ] Docs (REDESIGN_PROGRESS #386, BILLING.md), lint, typecheck, testes, commit final sem este arquivo

## Próximo passo

Item 9 (trava por pessoa no checkout, reserva do teste amarrada ao Asaas, compensação), depois 11, docs (inclusive a decisão do item 7) e passada final.
