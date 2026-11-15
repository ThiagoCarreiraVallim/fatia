# Acompanhamento do redesign (#367)

Onde está cada sub-issue da história #367: o canvas inteiro, com app, web, painel e site. O arquivo é atualizado a cada issue, para que qualquer sessão saiba onde parou.

**Processo.** O trabalho segue issue por issue, em grupos (etapas):

- Entre uma issue e outra: validação, PR com CI verde e merge automático no `main`.
- No fim de cada grupo: o dono testa o app (Expo Go), o PWA e o painel antes de começar o grupo seguinte.
- Como validar: lint, typecheck e testes; prova de vermelho nos testes novos; capturas da web (Playwright) e do app (emulador) contra a prancha do canvas, incluindo o comportamento descrito no script `x-dc` de cada prancha.

Para ler as pranchas: a cópia local fica em `.canvas/project/<Prancha>.dc.html`, fora do git. O canvas original é o artifact `GvL8GtYkJGjK5e4YovhZ3o`.

**Estados:** `a fazer` · `em andamento` · `validado` · `mergeado` · `testado` (pelo dono).

## Etapa 1: Base (`mergeado`, PR #422)

| Issue | Título                                              | Estado   | Observações                                                                                     |
| ----- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| #368  | Design system: fundamentos, componentes e movimento | mergeado | `@fatia/design` (tokens, contraste, cor de marca)                                               |
| #369  | Navegação: 5 abas, botão da IA e menu               | mergeado | Menu da IA: a tela encolhe até virar notch (Al-H6c5). No app não há "Ver o PRO" (regra da loja) |
| #370  | Dados do redesign × banco, estados e ADRs           | mergeado | `docs/DADOS_REDESIGN.md`                                                                        |

## Etapa 2: Onboarding, Hoje e Você (`validado`, branch `redesign/etapa-02`)

| Issue | Título                           | Estado   | Superfícies                                       |
| ----- | -------------------------------- | -------- | ------------------------------------------------- |
| #387  | Você e conta                     | validado | api, web, app; `fat.ia.br/apagar-conta` no site   |
| #373  | Hoje: resumo, metas, água e peso | validado | api, web, app                                     |
| #389  | Lembretes e notificações         | validado | api, web, app, MCP                                |
| #371  | Onboarding do aluno              | validado | api, web, app; conectores Google e Apple no Logto |

Pendências da etapa 2: cada uma depende de outra issue ou de algo externo.

- **Credenciais:** faltam o cliente OAuth do Google e, da Apple, Service ID, Team ID, Key ID e a chave `.p8`. Depois disso, rodar `pnpm logto:bootstrap`. Sem as credenciais, os botões Google e Apple caem na tela do Logto.
- **Hoje:**
  - "Para fazer", "Novo treino da Helena" e o cartão de evento têm contrato pronto (`today-contracts.ts`), mas a lista volta vazia. Ela é preenchida por #379, #383, #391 e #397.
  - O cartão Hábitos 3/5 depende de #390.
- **Você:** a tela não mostra as linhas que pertencem a issues futuras: Sua semana (#382), Avaliações (#383), Conquistas, IA (#385), Hábitos (#390) e Saúde do celular. Elas estão registradas em `navigation.ts` e na ADR 040.
- **Ajuda:** os tutoriais são só texto. Vídeos e o site de ajuda ficam com #415.
- **Lembretes:**
  - O lembrete de hábito (Al-V3c) depende de #390. `ReminderKind.HABIT` existe, mas a API recusa esse tipo por enquanto.
  - Os tipos de aviso novos (plano recebido, avaliação, questionário, comunicados, agenda, aniversário) já têm a chave na tela, mas ainda nada os envia. Cada emissor vem com a sua issue.
- **Onboarding:**
  - Onb-02b fica com #410, e Cm-04-Sobre com #393 (hoje o código entra com consentimento inline).
  - Onb-P1, saúde do celular, precisa de um dev build com Health Connect e HealthKit. A etapa aparece sozinha quando a integração estiver disponível.
  - Na web, o QR da recepção não é lido: só dá para digitar o código.
  - O teste grátis pela web leva a `/plan` (#386).
  - A categoria "Fotos das refeições" da Onb-03 não existe no enum `ShareScope` e precisa de migração.
- **Revisão de segurança (etapa 2):** sem bloqueante.
  - Corrigido:
    - o token do link de exportação não aparece mais no log nem no span;
    - o limite de baixas conta por link (antes contava por IP);
    - o link dura só mais 15 min depois da primeira baixa;
    - os tutoriais vistos têm limite de linhas.
  - Em aberto:
    - limitar as fotos de perfil pendentes por pessoa (upload `user_avatar`);
    - o job de lembretes varre todos os lembretes a cada minuto (filtrar por próximo envio);
    - conferir que o conector Google do Logto descarta e-mail com `email_verified=false` antes de ligar o vínculo automático de contas.
- **Decisão "segue o canvas":**
  - Em Unidades, só carga e distância: peso fica em kg e estatura em cm.
  - Em Lembretes, a tela tem só a chave do silêncio noturno. A API já aceita mudar o horário.

## Etapas seguintes

| Etapa                                   | Issues                                                                                                                                     | Estado  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 3 · Nutrição                            | #374 o dia, a refeição e a foto · #375 adicionar comida · #376 metas, nutrientes e plano alimentar                                         | a fazer |
| 4 · Treino A                            | #377 início, sessão e treino feito · #378 planos e exercício · #379 plano recebido, modelos, bloco e agenda                                | a fazer |
| 5 · Treino B e Progresso                | #380 circuitos · #381 treino livre e histórico · #382 progresso                                                                            | a fazer |
| 6 · IA, plano e MCP                     | #384 chat · #385 foto do prato, configurações e memórias · #386 plano e assinatura · #388 conectar sua IA                                  | a fazer |
| 7 · Comunidade no app                   | #393 comunidades e código · #394 mural · #395 desafios · #396 conteúdo da equipe                                                           | a fazer |
| 8 · Painel base                         | #398 layout e ⌘K · #399 para revisar · #400 relatório · #401 membros · #402 ficha                                                          | a fazer |
| 9 · Painel: conta e conteúdo            | #403 assentos e faturas · #404 equipe · #405 biblioteca · #406 editor de treino · #407 editor de alimentação · #408 dicas e catálogo       | a fazer |
| 10 · Painel: IA, configuração e celular | #409 automações · #410 boas-vindas · #411 assistente · #412 demo · #413 configurações · #414 painel no celular · #372 onboarding da equipe | a fazer |
| 11 · Aluno e equipe                     | #383 avaliação · #390 semana, hábitos e QR · #391 questionários · #392 cards · #397 agenda                                                 | a fazer |
| 12 · Site e fora de tela                | #415 site · #416 página pública e convite · #417 e-mail e lojas                                                                            | a fazer |

A #418 ("Sobras das issues absorvidas") é revisada no fim da história.

## Decisões do dono

- **Etapa 1:**
  - O canvas vence `docs/DESIGN.md`: Sora/Manrope e proteína `#6EA3FF`.
  - Tema claro só como tokens.
  - 5 abas, com a ADR 040 emendada.
- **Etapa 2:**
  - O preço do PRO vem do plano real (loja ou banco), nunca fixo.
  - Login com Google e Apple juntos.
  - Onde a issue diverge da prancha, **segue o canvas**.
  - Apagar conta pela web: página simples no estilo Al-V8.
- **Sempre:**
  - O app não vende fora da loja.
  - A foto só é guardada quando vira refeição, com consentimento (ADR 038).
  - Nada de módulo nativo que quebre o Expo Go sem fallback.

## Como retomar

1. Abrir este arquivo e achar a primeira issue em `a fazer` ou `em andamento`.
2. Criar a branch `redesign/<issue>-<slug>` a partir do `main` e baixar as pranchas da issue (`gh issue view <n>`) para `.canvas/project/`.
3. Implementar, validar, abrir a PR (`Closes #n`) e fazer o merge com CI verde. Atualizar este arquivo na mesma PR.
4. No fim da etapa: roteiro de teste para o dono e parada.
