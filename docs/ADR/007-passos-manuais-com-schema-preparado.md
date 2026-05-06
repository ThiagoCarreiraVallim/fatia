# ADR 007 — Passos manuais na v1, integrações preparadas mas adiadas

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

Adicionar contagem de passos como métrica diária, com meta. A pergunta é se vale a pena já implementar integração com fontes externas (Apple Health, Google Fit, Health Connect, Strava, Garmin, Fitbit) ou ficar só no input manual.

### Mapeamento das opções

| Fonte | Plataforma | API pública? | Esforço |
|---|---|---|---|
| Apple Health (HealthKit) | iOS | Não — só app nativo Swift | Alto (criar app nativo) |
| Health Connect | Android | Sim, via Android API | Médio (precisa app Android wrapper ou OAuth) |
| Google Fit | Android/Web | Sim, REST + OAuth | Médio |
| Strava | Multi | Sim, REST + OAuth | Médio (mas foco é corrida/ciclismo, passos é secundário) |
| Garmin | Wearable | Sim, OAuth | Médio |
| Fitbit | Wearable | Sim, OAuth | Médio |
| Webhook custom (Tasker/Atalhos) | Multi | Trivial | Baixo |

PWA puro **não consegue** ler dados de saúde do dispositivo. HealthKit e Health Connect só falam com apps nativos da mesma plataforma.

## Decisão

V1 implementa **input manual de passos** via:
1. Tool MCP `log_steps` — usuário fala pro Claude no fim do dia
2. Campo no PWA — input rápido no dashboard

Schema é desenhado **agora** já preparado para integrações futuras:
- `StepLog.source` (enum) — diferencia origem
- Múltiplos logs por dia permitidos — uma integração pode enviar parciais ao longo do dia
- Política de "valor do dia" no service — pega o **maior valor** entre logs do dia, não o último (proteção contra integração que envia parcial e overwrite manual)

Integrações ficam adiadas para Fase 5+ ("seria legal"), com prioridade sugerida quando for o momento:
1. Webhook genérico (mais flexível, atende usuário power)
2. Health Connect (atinge maioria Android com pouca complexidade)
3. Strava (atende usuários de corrida/ciclismo)

Apple Health fica fora do horizonte da v1 e v2 — exige app nativo iOS, que viola o princípio "PWA only" do projeto.

## Consequências

### Positivas
- Funcionalidade de passos disponível desde a v1 sem dependências externas
- Schema não precisa de migration breaking quando integrações chegarem
- Política de múltiplos logs cobre cenários reais futuros (integração + correção manual)
- Política "maior valor vence" é defensiva — usuário sempre vê o número mais alto, raramente é problema

### Negativas
- Atrito de digitar passos manualmente todo dia
- Esquecimento provável — passos podem ficar subnotificados
- Histórico parcial até implementar integração

### Neutras
- Webhook em Fase 5+ permite usuário tech-savvy montar automação Tasker/Atalhos sem suporte oficial
- Decisão preserva 100% do schema na transição para integrações

## Política de "valor do dia"

Quando há múltiplos `StepLog` para a mesma `date` do mesmo `userId`:

```
effectiveSteps = max(steps for all logs of that date)
```

Justificativa:
- "Maior valor" reflete melhor a realidade — passos só sobem ao longo do dia
- Integrações que enviam parciais nunca "atrapalham" um log manual posterior maior
- Correção manual ("foi mais que isso") sempre prevalece sem precisar deletar log antigo

Casos de borda documentados:
- Se usuário quiser **reduzir** o valor de um dia (corrigiu pra menos), precisa **deletar** logs maiores via `delete_step_log`. Não é silencioso porque é raro e potencialmente errado (passos não diminuem espontaneamente).
- Empate de `steps` entre logs: irrelevante, valor é o mesmo.

## Reversibilidade

Mudar política para "último vence" no futuro é trivial — uma linha em `StepLogService.getStepsForDate`. Schema não muda.

Adicionar uma fonte nova: adicionar valor ao enum `StepSource`, implementar OAuth + endpoint de sync. Schema não muda.

## Alternativas consideradas

- **Um log único por dia (`@@unique([userId, date])`)**: rejeitado. Conflita com integrações futuras que enviam parciais. Forçaria delete-and-create em vez de append, ruim pra auditoria.

- **Gravar timestamp de "início" e "fim" do log**: rejeitado. Overengineered pra v1. Loga-se um número, simples.

- **Implementar Webhook genérico já na v1**: adiado. Útil pra ~5% dos usuários, custo de design (autenticação separada, schema do webhook) não compensa antes de validar uso real.

- **Implementar Health Connect já na v1**: rejeitado. Exige app Android wrapper ou OAuth flow custom. Adiciona complexidade significativa para benefício específico de subset dos usuários.
