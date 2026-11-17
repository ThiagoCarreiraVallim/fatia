# HANDOFF #384 — correções da revisão adversarial (sobre 8ce9e0f3)

Worktree `.claude/worktrees/384-chat`, branch `redesign/384-chat`. Não fazer push. A #385
(`redesign/385-ia-config`) parte de 8ce9e0f3: mudanças focadas. Teste primeiro, visto vermelho.

## Checklist

- [x] R1 (fa8415f1, 38e0f04c, 7c1a6721; 44/70 vermelhos antes) toda tool com cartão de verdade (produtor por tool ou genéricos robustos; spec com amostra real por tool, sem o "17 tools")
- [ ] 1 foto do chat transitória (24 h), apagada pela varredura se não virou refeição; gancho `promoteChatPhotoToMeal` para a #385; ADR 046 cede à 038
- [x] 2 (falta texto: aceite, /privacy, DATA_RETENTION) pergunta da busca gerada numa chamada separada que só vê a última fala; regex depois; teste com modelo falso vazando perfil/memória; aceite, /privacy, DATA_RETENTION
- [x] 3 aceite em toda chamada do HostedAiService (ditado, foto, rótulo); 403 abre o aceite; loading/erro = sem aceite; `useChatLiberado` → inglês
- [ ] 4 fotos do chat no export LGPD com link assinado e a mensagem
- [x] 5 fila pausa depois de erro (Enviar/Descartar), retry reenvia a que falhou, web espera `stopChatRun`, 409 `CHAT_RUN_IN_PROGRESS` com backoff (web e app)
- [x] 6 app: `dispatch` depois do upload confere parada e conversa
- [x] 7 lote com busca: aceite só no Enviar e se a escolha final for concordar; estado selecionado; contagem inclui busca
- [x] 8 busca sem `usage` ou parada no meio cobra 1 unidade
- [~] 9 (feito: kind desconhecido, prévia, aceite da config+hash, 403 legível; falta nada) kind desconhecido não quebra (web e app); prévia sem a citação; aceite com modelo/provedor da config e hash do texto amarrado à versão; app antigo com 403
- [ ] fim: lint, typecheck, testes (API em fatia_t384, agente pytest/ruff/mypy), números do MCP, REDESIGN_PROGRESS, ADR 046, /privacy, DATA_RETENTION, apagar este arquivo

## Comandos

- DB: `export DATABASE_URL=$(grep '^DATABASE_URL=' /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | tr -d '"' | sed -E 's#/fatia(\?|$)#/fatia_t384\1#')`
- Agente: `cd apps/agent && uv run --offline pytest -q && uv run --offline ruff check src tests && uv run --offline mypy src`

## Próximo passo

Itens 1 e 4 (fotos do chat); depois docs (aceite/privacy/DATA_RETENTION/ADR 046/REDESIGN_PROGRESS) e a rodada final.
