# HANDOFF #399 — Painel: para revisar, em risco e sessão feita

Branch `redesign/399-para-revisar` (da main 338f4870). Sem push, sem PR.
Banco de teste: `fatia_t399` (.env do worktree já aponta; recriar com DROP/CREATE + migrate deploy + seed:taco + seed:exercises).
Pranchas baixadas em `.canvas/project` do checkout principal: Pn-02-Revisar, Pn-35-Sessao, Pn-35b-Sessao-sem-treino.

## Decisões (orquestrador)

- Sem chat no Fatia (#306/#338 etapa 2): conversa pelo WhatsApp → ADR 048; fechar #306 citando a ADR.
- Só comentário por sessão (#303); por exercício = melhoria futura.
- Aluno não responde no app; resposta pelo WhatsApp.
- Questionários (#391) e avaliações (#383) fora: "Falta".

## Decisões minhas (registrar no REDESIGN_PROGRESS)

- Fila: treinos concluídos (WORKOUT), metas concluídas (GOALS), respostas a planos (aceite/recusa de oferta desta comunidade, sem escopo: é resposta ao que a equipe mandou) e check-ins sinalizados de desafio (só link, sem "Visto"). Últimos 7 dias.
- Só lê quem tem vínculo ativo com o escopo; cada leitura por `assertReadable` (ação `list_review_queue`, `list_at_risk`, `get_review_session`). Sem tentativas negadas em massa na lista (só lê o escopo que o vínculo tem).
- Em risco nominal: só vínculo ativo com quem olha; último registro nas categorias liberadas (treino, alimentação, corpo, hábitos). Limite `Group.riskDays` (padrão 7; 2× = "sumiu"). Nenhum número agregado novo (evita inferência por diferença); contagem da aba = linhas visíveis.
- Contador do menu: não (exigiria ler saúde a cada tela).
- Visto por pessoa da equipe (`ReviewSeen`); comentar marca visto para quem comentou.
- Push diário opcional por comunidade (`GroupMembership.riskDigest`), conta só as linhas que a pessoa já vê.

## Feito

- (nada ainda)

## Falta

- tudo
