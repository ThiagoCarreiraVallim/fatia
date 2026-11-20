# HANDOFF #400 — correções da revisão adversarial

Branch `redesign/400-relatorio`. Banco de teste `fatia_t400`. Spec do revisor:
`/tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/zz-review-400.integration.spec.ts`.

## Desenho das correções

1. Semanas: bloco oculto (semanas suprimidas) só fecha com 2+ semanas e 5+ pessoas de cada lado na união; senão suprime a menor semana visível junto; se não fechar, total, por ativo, delta e média saem nulos.
2. Só mês fechado: `months` começa no mês passado; mês corrente = 400; sai `partial` e "(até ontem)".
3. `MonthReportSnapshot (groupId, month, data, createdAt)`, unique; `build` lê o snapshot ou calcula e grava com `createMany skipDuplicates`, devolvendo o que ficou gravado. Meta, nome e `months` ao vivo.
4. Origens: linhas < 5 viram uma "Outras origens" (kind `other`); se ela tiver < 5, some de tudo (inclusive do total).
5. 30 dias: célula do rótulo (e total) suprimida quando a diferença para 7 dias é de 1 a 4 (entraram) ou os lados da ativação não são 0/0 ou 5+/5+.
6. Migration: UPDATE reportEmailMonth = mês passado; envio só entre o 1º e o 3º dia útil.
7. Lease: `reportEmailClaimedAt`; mês gravado só depois do envio; falha solta o lease.
8. Zerar `reportEmail` (e `riskDigest`) na reentrada e no changeRole.
9. activeByDay semanal; docs em "O que não está protegido".
10. Try por comunidade no job.

## Estado

- [x] testes vermelhos api (report-review.integration.spec.ts + ajustes em report e report-email)
- [ ] correções api + migration
- [ ] api-client/web (sem "(até ontem)", Outras origens)
- [ ] docs
- [ ] merge origin/main, banco recriado, lint/typecheck/testes
