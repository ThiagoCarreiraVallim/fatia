# Product Requirements Document — Fatia

> **Descreve o produto de hoje.** A versão anterior registrava a v1 (2026-05), um rastreador
> self-hosted para cinco a dez amigos; ela está no histórico do git. A troca e a nova regra de
> escopo estão na [ADR 037](./ADR/037-prd-descreve-o-produto-atual.md).

## 1. Problema

**Para quem treina e quer comer melhor.** Registrar comida e treino dá trabalho, e quem desiste
desiste nas primeiras semanas. Os apps conhecidos são caros, em inglês ou com base de alimentos
estrangeira, e não conhecem o prato brasileiro: arroz, feijão, farofa, pão de queijo, medida caseira.

**Para a academia.** O problema número 1 do dono é a evasão: a academia perde de 10% a 13% dos
alunos por mês, e boa parte de quem entra sai nos primeiros 90 dias. O que segura o aluno é
**constância** (ir pelo menos 2 vezes por semana) e **vínculo** (conhecer gente, ser lembrado pela
equipe). O sistema de gestão da academia cobra a mensalidade e abre a catraca; nenhum cuida disso, e
nenhum tem nutrição.

**Para o personal, a nutricionista e o influencer.** O acompanhamento fica espalhado entre planilha,
PDF, WhatsApp e plataforma de venda de curso. Não há um lugar onde o aluno registra, o profissional
acompanha e a comunidade se motiva junto.

## 2. Para quem é

| Quem                                                                                   | O que usa                                                                                                             | Como paga                                                                                                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aluno** (qualquer pessoa)                                                            | App (iOS, Android) e web: registro de refeição, treino, água, peso e passos; metas; progresso; comunidades            | **FREE**: tudo, menos a IA hospedada. **PRO**: com IA (chat, foto do prato, ditado)                                                             |
| **Equipe da comunidade** — academia, box, estúdio, personal, nutricionista, influencer | Painel (web e app): membros, convites, conteúdo, catálogo de exercícios, agente, desafios, mural, moderação, insights | Compra **assentos** de PRO para membros escolhidos; outras camadas em estudo ([#276](https://github.com/ThiagoCarreiraVallim/fatia/issues/276)) |
| **Quem traz a própria IA**                                                             | O conector MCP no Claude ou em outro cliente: o mesmo produto, conversando                                            | FREE — a inferência é dele ([ADR 018](./ADR/018-inferencia-hospedada-fora-do-mcp.md))                                                           |
| **Quem self-hosta**                                                                    | A stack inteira no próprio servidor, licença MIT                                                                      | Nada; `AI_REQUIRES_PLAN=false` libera a IA para a instância ([ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md))                              |

Papéis da comunidade: `OWNER`, `PROFESSIONAL`, `CREATOR` e `MEMBER` — o que cada um faz está em
[`PERMISSIONS.md`](./PERMISSIONS.md).

## 3. Princípios que o produto não negocia

1. **Registrar é rápido sem IA.** O FREE não tem IA hospedada, então recentes, favoritos, medidas
   caseiras, copiar dia, refeições salvas e código de barras são o centro do produto, não acessório.
2. **O dado é do aluno.** Exportar e apagar a conta são livres e expostos como tool
   (`export_my_data`, `delete_my_account`). A equipe da comunidade só lê o que o aluno consentiu, por
   categoria, e ele revoga quando quiser ([ADR 026](./ADR/026-consentimento-ao-entrar-na-comunidade.md)).
   O resto ela vê agregado, com supressão de células pequenas ([`AGGREGATION_POLICY.md`](./AGGREGATION_POLICY.md)).
3. **Pagamento degrada, nunca bloqueia.** Inadimplência — do aluno ou da comunidade — tira só a IA
   hospedada, depois da carência. Registro, histórico e MCP continuam.
4. **Ninguém compara corpo.** Desafios e rankings medem aderência à **própria** meta e constância,
   nunca peso, medida ou foto ([ADR 027](./ADR/027-desafios-por-aderencia-a-propria-meta.md)).
5. **MCP-first.** Toda função do app existe como tool MCP ([ADR 006](./ADR/006-mcp-first.md)),
   com duas exceções declaradas: inferência paga pela Fatia (ADR 018) e a administração da
   comunidade.
6. **Foto de refeição não vira arquivo.** Foto e áudio vão à IA e somem
   ([ADR 004](./ADR/004-sem-armazenamento-fotos.md), [ADR 020](./ADR/020-foto-e-audio-trafegam-sem-persistencia.md)).
   Imagem que a pessoa **publica** na comunidade é outra coisa e é guardada sem EXIF
   ([ADR 028](./ADR/028-imagens-de-posts-da-comunidade.md)).
7. **Isolamento é da aplicação e é testado.** Recurso de outra pessoa responde `NOT_FOUND`, igual a
   inexistente ([ADR 010](./ADR/010-row-level-security.md), [`THREAT_MODEL.md`](./THREAT_MODEL.md)).

## 4. O que o produto faz

### Aluno

- **Nutrição:** base TACO (597 alimentos) e Open Food Facts por código de barras; medidas caseiras;
  recentes e favoritos; alimentos próprios; refeições salvas; copiar refeição e dia; metas de kcal e
  macros em faixa, sugeridas no onboarding (gasto calórico por Mifflin-St Jeor); água.
- **Treino:** catálogo de 873 exercícios com músculos e instruções, mais o catálogo da academia
  (aparelhos, vídeos e dicas dela); planos; sessão com séries, carga, RPE e "previous"; cardio;
  prescrição de carga; periodização em blocos.
- **Progresso:** peso, passos, gráficos de carga, cardio e peso, sequências e conquistas.
- **IA hospedada (PRO):** chat que registra e consulta pelo mesmo catálogo de tools, com
  confirmação antes de escrever, memória e conversa que continua no servidor; foto do prato; ditado;
  o agente da comunidade (nome, avatar e orientações da equipe).
- **Comunidades:** entrar por convite, link ou código, com consentimento por categoria; mural com
  imagens, reações e comentários; desafios com ranking só de quem participa; planos prontos, dicas e
  exercícios da comunidade; avisos no celular e no navegador.

### Equipe da comunidade

- Painel na web e no app: membros (aprovar, papel, assento, remover, banir), convites (link, e-mail,
  lote por CSV), assentos e faturas, planos e dicas, exercícios e equipamentos, agente, desafios,
  moderação do mural e insights agregados de retenção e comportamento.
- Leitura do aluno que consentiu, com registro de cada acesso.

### Cobrança

- PRO pessoal pela web (Asaas: Pix, boleto, cartão) e pelas lojas (RevenueCat); assentos de
  comunidade pela web. Valores, estados e webhooks em [`BILLING.md`](./BILLING.md).

## 5. Não-objetivos

Valem para todo trabalho. Mudar qualquer linha desta seção exige ADR (ADR 037).

**Fora, sem exceção prevista:**

- ❌ **Comparar corpo** entre pessoas — ranking, desafio ou post com peso, medida ou foto de corpo (ADR 027)
- ❌ **Guardar a foto da refeição** (ADR 004, ADR 020)
- ❌ **Bloquear o app ou o histórico por falta de pagamento** — só a IA hospedada degrada
- ❌ **Inferência paga pela Fatia exposta pelo MCP** (ADR 018)
- ❌ **Ser o sistema de gestão da academia** — matrícula, cobrança de mensalidade, catraca, agenda de
  aulas. O Fatia complementa esse sistema; não o substitui
- ❌ **Vender dado de aluno** ou entregar à equipe o que ele não consentiu, por qualquer preço
  ("pagar mais não compra recorte mais estreito", `BILLING.md`)
- ❌ **Sugestão automática de receitas** geradas por IA
- ❌ **Conteúdo próprio do Fatia** — planos, dietas e aulas são da equipe de cada comunidade; o
  Fatia não cura nem vende conteúdo
- ❌ **Sincronização offline de escrita** (cache de leitura é aceito)
- ❌ **Frequência cardíaca em tempo real e GPS de corrida** — vêm de wearable/app de corrida, não do Fatia
- ❌ **App nas lojas com a marca de cada comunidade** (white-label) — a marca aparece dentro do Fatia

**Em discussão** — têm issue com a label `discussion` e só entram com ADR:

| Tema                                               | Issue                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Cobrança por aluno ativo (revê parte da ADR 025)   | [#289](https://github.com/ThiagoCarreiraVallim/fatia/issues/289) |
| Plano pago de ferramenta para o profissional       | [#296](https://github.com/ThiagoCarreiraVallim/fatia/issues/296) |
| Fotos de progresso, privadas                       | [#300](https://github.com/ThiagoCarreiraVallim/fatia/issues/300) |
| Receitas autorais (do profissional ou do aluno)    | [#334](https://github.com/ThiagoCarreiraVallim/fatia/issues/334) |
| MCP para a equipe da comunidade                    | [#343](https://github.com/ThiagoCarreiraVallim/fatia/issues/343) |
| Tema claro                                         | [#352](https://github.com/ThiagoCarreiraVallim/fatia/issues/352) |
| Unidades e outros idiomas (hoje só pt-BR; ADR 016) | [#353](https://github.com/ThiagoCarreiraVallim/fatia/issues/353) |

## 6. Métricas de sucesso

| Métrica                                                      | Por quê                                |
| ------------------------------------------------------------ | -------------------------------------- |
| Ativação: convidado → primeiro registro em 48 h              | Diz se o convite da academia vira uso  |
| Dias ativos por semana, por aluno                            | Constância é o que retém na academia   |
| Retenção semanal (semana 1, 4 e 8)                           | Diz se o app se sustenta sem novidade  |
| Conversão teste → PRO e cancelamento do PRO                  | Saúde da receita do consumidor         |
| Comunidades com membros ativos e com desafio rodando         | Saúde do B2B                           |
| Custo de IA por usuário ativo, por origem (`AiUsage.paidBy`) | Margem do preço fixo                   |
| Registro de refeição em menos de 30 s                        | Atrito é o que faz desistir            |
| Zero acesso cruzado sem consentimento                        | Promessa central; verificada por teste |

## 7. Riscos

| Risco                                                     | Mitigação                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Dado de saúde de estranhos, lido por terceiros (a equipe) | Consentimento por categoria, leitura registrada, agregado com supressão, `THREAT_MODEL.md`, export e exclusão |
| Custo de IA acima do preço fixo                           | Cota por usuário e global; tabela de preço obrigatória por modelo; modelos revisados em `allowed_models.py`   |
| O app não reter por si só                                 | O produto aposta em constância e comunidade (desafios, mural, avisos, equipe), não só em registro             |
| Estimativa de macro por foto com erro de 20–30%           | Correção em linguagem natural e conferência antes de salvar                                                   |
| Um servidor só                                            | Backup cifrado fora da máquina, restore testado, monitor externo (`OPERATIONS.md`)                            |
| Escopo crescer sem critério                               | Esta lista de não-objetivos, mudada só por ADR                                                                |

## 8. Onde está o resto

- **Como o sistema é feito:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Por que é assim:** [`ADR/`](./ADR/)
- **O que está sendo feito:** [Issues](https://github.com/ThiagoCarreiraVallim/fatia/issues) — a
  épica [#275](https://github.com/ThiagoCarreiraVallim/fatia/issues/275) reúne o que falta antes do
  piloto com academias
- **Tools MCP:** [`MCP.md`](./MCP.md)
