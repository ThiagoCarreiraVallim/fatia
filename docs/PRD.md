# Product Requirements Document — Fatia

## 1. Problema

Usuários (eu, namorada, amigos) querem acompanhar nutrição e treino de forma simples, com mínimo atrito no logging diário. Apps existentes ou são caros (MyFitnessPal premium), ou têm interface ruim, ou não têm integração com IA conversacional.

A oportunidade: usar o Claude como interface principal de logging — tirar foto da comida, falar "comi 200g de frango com arroz", "fiz supino com 60kg 4x10" — enquanto o PWA serve só pra visualização e correção pontual.

## 2. Usuários

- **Owner (eu):** desenvolve, mantém, usa diariamente
- **Familiares/amigos próximos:** ~5-10 pessoas, contas individuais, dados isolados
- Sem onboarding público, sem signup aberto. Convites manuais (admin cria contas)

## 3. Objetivos do produto

1. Reduzir atrito no logging de comida (3 cliques ou menos via Claude)
2. Manter histórico estruturado e queriável de nutrição e treino
3. Mostrar progresso de peso corporal e carga (strength) ao longo do tempo
4. Servir múltiplos usuários com isolamento total de dados

## 4. Não-objetivos (escopo NEGATIVO explícito)

Decididos conscientemente para manter escopo viável:

- ❌ Conteúdo autoral (programas de treino prontos, receitas curadas, vídeos de form, aulas)
- ❌ Catálogo curado de planos de treino
- ❌ Instruções de execução de exercícios
- ❌ Sugestões inteligentes de receitas
- ❌ Barcode scanner de produtos
- ❌ Fotos de progresso (Entries)
- ❌ Sistema de aulas/lessons
- ❌ App nativo iOS/Android (PWA cobre)
- ❌ Sincronização offline de escrita (read-only cache OK)
- ❌ Exportação de dados (deixar pra quando alguém pedir)
- ❌ Modo claro (apenas dark)
- ❌ Internacionalização — só pt-BR
- ❌ **Integração automática de passos com Apple Health / Google Fit / Strava / Garmin / Fitbit na v1.** Schema preparado para receber via `StepLog.source` quando implementarmos. Justificativa em ADR 007.
- ❌ Frequência cardíaca em tempo real durante treino (apenas valor médio digitado)
- ❌ GPS / mapa de corrida

## 5. Funcionalidades por fase

### Fase 1 — Nutrição core
- Login/signup (admin cria contas)
- Definir metas de calorias e macros (em range: min-max)
- Logar refeição com itens (nome, gramas, kcal, P/C/G)
- Buscar alimentos na base TACO
- Categorizar refeição: café, almoço, jantar, lanche
- Ver totais do dia vs. meta com barras de progresso
- Navegar entre dias
- Editar/deletar item de refeição

### Fase 2 — Treino core
- Catálogo de exercícios (seed inicial ~60, força + cardio)
- Criar planos de treino (Push, Pull, Leg, etc.)
- Iniciar sessão de treino
- **Força:** logar séries com peso, reps, RPE opcional
- **Cardio:** logar entradas com duração, distância, frequência cardíaca, kcal queimadas (opcionais)
- Ver "previous" — última carga ou último tempo do mesmo exercício
- Notas por exercício
- Finalizar sessão
- Histórico de treinos
- Treinos híbridos (força + cardio na mesma sessão) suportados

### Fase 3 — Progresso e atividade
- Logar peso corporal
- **Logar passos diários** (manual via Claude no fim do dia ou via PWA)
- Múltiplos logs de passos por dia permitidos (preparado para futura integração)
- Gráfico de evolução de peso (14/30/90 dias)
- Gráfico de evolução de carga por exercício (força)
- Gráfico de evolução de cardio por exercício (duração/distância/pace)
- Gráfico de passos diários
- Médias semanais
- Meta de passos diários (parte de UserGoals)

### Fase 4 — Polimento
- PWA installable
- Gerenciamento de tokens MCP (criar/revogar)
- Dashboard com checklist diário
- Dark mode polido

## 6. Métricas de sucesso

- Logging de >80% das refeições do dia (auto-reportado)
- Zero perda de dado (backups automáticos do Postgres)
- Tempo médio de log via Claude < 30s por refeição
- 100% das chamadas MCP autenticadas e isoladas por usuário

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Estimativa de macros via foto pode ter 20-30% de erro | Permitir correção em linguagem natural ("na verdade era 200g") |
| Multi-usuário com dados sensíveis | RLS-style guards em todo endpoint, testes específicos |
| MCP remoto sem auth = vazamento | Token por dispositivo, hasheado, revogável |
| Servidor próprio cai | Docker Compose simples + backup diário do volume Postgres |
| Escopo crescer | Lista de não-objetivos explícita; novas ideias vão pra "Fase 5+" |

## 8. Decisões abertas

- [ ] Importar TACO completa (~600 itens) ou só top 200 mais comuns?
  → **Decisão:** completa, é só uma vez.
- [ ] USDA via API agora ou depois?
  → **Decisão:** depois (Fase 5+).
- [ ] Mobile push notifications?
  → **Decisão:** não, PWA já cobre instalação na home screen.
