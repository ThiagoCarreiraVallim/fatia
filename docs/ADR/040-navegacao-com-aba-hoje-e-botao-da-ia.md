# ADR 040 — Navegação com aba Hoje, aba Você e o botão da IA à direita

**Status:** Accepted (revisada em 2026-11-14 — ver "Revisão"; implementada na #369)
**Data:** 2026-11-09

## Contexto

A navegação atual (`packages/api-client/src/navigation.ts`, `docs/DESIGN.md`) tem a barra
**Nutrição · Treino · [+] Registrar · Comunidade · Mais**, sem aba Início: o Início é a raiz, e o
resto das telas mora no menu "Mais".

O redesign coloca o dia no centro do app e a IA a um toque de qualquer tela. O canvas tinha duas
versões (o "Registrar" no centro, em Componentes, e o botão da IA à direita, na tela principal); o
dono do produto escolheu a da tela principal.

## Decisão

1. **Barra de baixo: 5 abas só de ícone** — **Hoje · Nutrição · Treino · Comunidade · Você** —,
   cada uma com `aria-label` (o nome é para o leitor de tela; a aba ativa ganha fundo claro). À
   direita, separado das abas, um **botão redondo da IA**.
2. **O botão da IA abre um menu de baixo** ("O que vamos registrar?") com:
   - **registro manual primeiro**: refeição, água, peso, passos, treino;
   - **foto do prato** e o campo para falar com a IA;
   - as conversas em andamento ("esperando você", "pensando…") e recentes, e sugestões.

   **Hábito e Check-in** entram no registro manual **só quando a #390 existir** (etapa 11); até lá
   não aparecem, nem desativados. Para quem está no FREE, o registro manual e a foto bloqueada (com
   a oferta do PRO) aparecem; o registro nunca depende da IA (PRD §3.1). A IA trabalhando ou
   esperando confirmação aparece no próprio botão (selo e anel), e a aprovação pelo cartão segue a
   [ADR 039](./039-ia-grava-no-modo-automatico.md).

3. **"Mais" deixa de existir, e Você é aba.** Você é **uma tela só, com seções** (Progresso,
   Nutrição, Treino, IA, Comunidade e equipe, Rotina e avisos, Conta), sem submenu: perfil, metas,
   progresso, recordes, conquistas, avaliações, lembretes, notificações, plano, "Conectar sua IA",
   unidades, exportar e apagar a conta. O ícone da aba é o avatar da pessoa.
4. **Sino de avisos no topo do Hoje**, à direita da saudação, com o ponto de não lidos
   (`Al-H1-Hoje`). Em Você, os avisos são a linha **Notificações** da seção "Rotina e avisos"
   (`Al-V1-Voce`), não um sino no cabeçalho.
5. **A equipe usa a mesma barra.** O painel da comunidade fica **dentro da aba Comunidade**, como
   "Mural | Painel" para quem tem papel de equipe; não há barra própria do painel no celular.
6. **A barra some nas tarefas de foco** (sessão de treino em andamento, câmera, leitor de código,
   folha de registro, onboarding, conversa aberta) e aparece em toda tela de ver. O treino em
   andamento ganha uma barra própria acima do menu.
7. **A aba Hoje é a raiz.** O voltar hierárquico continua (`ROUTES`), subindo até a aba dona da tela
   (Hoje, Nutrição, Treino, Comunidade ou Você).
8. **Desktop:** barra lateral com as cinco abas e o botão da IA.
9. **Uma fonte de verdade continua** em `navigation.ts`, usada pelo web e pelo app.

## Consequências

### Positivas

- O dia vira a primeira tela, e a IA e o registro ficam a um toque de qualquer aba.
- Você na barra tira o "avatar escondido" do topo: perfil, plano e progresso ficam a um toque.

### Negativas

- O "+" Registrar no centro some: quem registra sem IA passa pelo menu do botão da IA. O menu
  precisa abrir com o **registro manual primeiro**, para o FREE não parecer bloqueado.
- Aba só de ícone depende de ícones claros e do `aria-label`; o teste de acessibilidade confere.
- Muda `navigation.ts`, os dois layouts (web e app), `quick-add`, os testes de navegação, as fotos
  do `ui:snap` e o `docs/DESIGN.md` (que hoje diz "não há aba Início").
- A transição em que a tela encolhe e vira um "notch" acima do menu é cara de fazer bem nos dois
  clientes; um menu de baixo comum (como o "+" atual) é a primeira entrega aceitável.

### Neutras

- O conector MCP não muda: navegação é coisa da tela.

## Alternativas consideradas

- **Manter "+" no centro e "Mais" (navegação atual).** Rejeitada pelo redesign: o dia e a IA ficam
  a dois toques.
- **"Registrar" no centro e IA dentro dele** (versão de Componentes do canvas). Rejeitada pelo dono
  do produto em favor do botão da IA à direita.
- **Quatro abas e Você pelo avatar no topo do Hoje** (texto original desta ADR, 09/11). Revisto em
  14/11: ver abaixo.

## Revisão 2026-11-14

O texto de 09/11 decidia quatro abas (Hoje · Nutrição · Treino · Comunidade) e a área Você pelo
**avatar no topo do Hoje**, com o sino ao lado do avatar e, no desktop, as quatro abas mais a área
Você. O canvas de 10/11 (pranchas `Al-H1-Hoje`, `Al-V1-Voce` e a decisão 0.x do `Mapa`) e a #369
mudaram isso, e o dono do produto seguiu o canvas:

- **Você virou a quinta aba** (item 3), uma tela só com seções, e o avatar saiu do topo do Hoje.
- **O sino ficou sozinho no topo do Hoje**; em Você, os avisos são uma linha da lista (item 4).
- **O painel da equipe foi para dentro da aba Comunidade** ("Mural | Painel") (item 5).
- **A barra some nas tarefas de foco** (item 6), e as abas são só ícone com `aria-label` (item 1).
- **Hábito e Check-in** só entram no menu da IA com a #390 (item 2); a ADR citava #328 e #321, que
  foram absorvidas pela #390.
- **Desktop:** cinco abas e o botão da IA na barra lateral (item 8).

Detalhes do componente visual, conferidos no canvas pela #368 (prancha Componentes, "Barra de
navegação", e `.nav.n5` em `canvas.css`):

- **Ícones das abas:** Hoje (`home`) · Nutrição (`apple`) · Treino (`dumbbell`) · Comunidade
  (`users`) · Você (avatar). Toda aba tem nome para leitor de tela (`aria-label`/
  `accessibilityLabel`), e a ativa tem `aria-current` e ganha o fundo `foreground` com o ícone em
  `background`.
- **Botão da IA:** redondo, 68 px, ícone `spark`, verde da marca.
- **A barra fica por baixo das folhas.** Nas telas de ver com ação principal, o botão de ação sobe
  para cima da barra; o **voltar do sistema fecha o menu da IA**, como qualquer folha.
- **Aparência** (Sistema, Escuro ou Claro, [ADR 041](./041-tema-claro.md)) é uma linha de Você.

O resto (botão da IA à direita, menu com registro manual primeiro, Hoje como raiz, `navigation.ts`
como fonte única) não mudou. O componente visual (barra de 5 abas + botão da IA, nos dois temas)
entra com a #368; a troca da navegação (`navigation.ts`, layouts, testes) é da #369.

## Implementação (#369, 2026-11-14)

A troca entrou no PWA e no app no mesmo trabalho. O que a implementação decidiu além do texto acima:

- **Rotas de foco** (`navBarMode` em `navigation.ts`): `/chat` e `/chat/:id`, `/nutrition/photo`,
  `/nutrition/scan`, `/community/new`, `/onboarding`, os editores do painel e a sessão de treino
  aberta (`/workout/session/:id` no app). No PWA a sessão aberta mora em `/workout`, então
  `/workout` com sessão aberta também esconde a barra.
- **`/students`** (personal) não ganha barra própria nem some: acende **Comunidade**, como o
  painel (`/org`). Perfil, Progresso, Metas e Plano acendem **Você**.
- **Sino:** sozinho no topo do Hoje, ao lado das metas do dia; em Você, a linha **Notificações**
  de `menuSections`. Os dois levam às preferências de notificação (a central do sino é da #373;
  a tela de Notificações virou a `Al-V4` na #389).
- **Desktop:** o menu da IA é a mesma folha, aberta à direita com 480 px; a barra lateral tem o
  logo, o botão da IA e as cinco abas com nome.
- **Estado da IA no botão** vem de dados que já existem: `GET /chat/conversations?state=` e
  `GET /chat/conversations/pending-count`. "Esperando você" é a conversa cuja última mensagem da IA
  ficou `interrupted`; "pensando" é a que tem turno rodando no `ChatRunRegistry`, que é **em
  memória** ([ADR 035](./035-chat-desacoplado-da-requisicao.md)): com mais de uma réplica da API, ou
  depois de um reinício, uma conversa pode deixar de aparecer como "pensando". Ninguém é afetado
  além do anel; a resposta segue chegando.
- **Cartão "esperando você"**: aprova pelo `resume` com o `interruptId` da pausa; se a conversa
  andou desde ela, o agente responde 409 e o cartão só oferece "Abrir conversa". O toast
  "Gravado" ainda **não tem "Desfazer"**: o `resume` não devolve ao cliente o id do registro criado
  (fica para o "Gravado" com retrato da #385).
- **O descanso da sessão sobe para o layout** (`RestTimerProvider`), para a barra "treino em
  andamento" mostrar a contagem e o "+30 s" fora da sessão; antes, sair da sessão cancelava o
  descanso.
- **No app, o aviso "Respondendo…" acima da barra saiu:** o anel do botão da IA faz o papel, e
  também gira com a resposta que esta sessão está recebendo.
- **Engrenagem** do menu (config da IA) fica de fora até a #385, que cria a tela.
- **Cards da aba Treino:** `GET /workout/muscles/week` agrega `SessionSet` × `Exercise.primaryMuscles`
  dos últimos 60 dias em grupos canônicos (meta de 12 séries por semana; descansado a partir de 2
  dias), sem tabela nova. O humor do último treino vem com a #377.

## Implementação de Você (#387, 2026-11-15)

A tela Você segue a prancha `Al-V1-Voce` (decisão do dono do produto: onde a issue e a prancha
divergem, vale a prancha). O que a implementação decidiu além do item 3:

- **Linhas só com destino.** `menuSections` lista as linhas da prancha cujo destino já existe. Sua
  semana e cards (#382), Avaliações com "1 pedida" (#383), Conquistas, Configurações da IA (#385),
  Hábitos (#390), Lembretes com "5 ativos" (#389), a saúde do celular (#371) e Objetivo e rotina
  entram com as issues donas das telas; até lá não aparecem, nem desativadas.
- **Linhas que agem ali mesmo** (`kind` em `MenuItem`): "Guardar fotos das refeições" é um
  interruptor (ADR 038, a mesma preferência da pergunta na primeira foto); "Trocar senha" abre o
  "esqueci minha senha" do Logto, que manda o código por e-mail e volta para Você; "Exportar meus
  dados" pede o link de 24 h (`POST /users/me/exports`) e o abre.
- **Unidades**: só carga (kg/lb) e distância (km/m/milhas), como a `Al-V10`; peso e estatura ficam
  em kg e cm. Banco e API seguem métricos; a conversão é só na tela, e a equipe vê na unidade dela.
- **Quem vê a foto**: "Minhas comunidades" ou "Só a equipe", as duas opções da `Al-V9`.
- **`/profile` vira `/you`**: as rotas antigas redirecionam, e Editar perfil, Unidades, Novidades,
  Ajuda e Apagar conta moram em `/you/*` no PWA e no app.
- **Apagar sem o app**: `fat.ia.br/apagar-conta` (site estático) explica e leva a
  `app.fat.ia.br/apagar-conta`, pública, que pede login e mostra a mesma tela da `Al-V8`.
- **Privacidade e Termos** ficam no fim de Você no app (diretriz 5.1.1 da App Store).

## Lembretes e Notificações em Você (#389, 2026-11-15)

- **"Rotina e avisos"** ganha **Lembretes** (`/you/reminders`, ícone sino, detalhe "N ativos")
  antes de **Notificações**. "Hábitos" (#390) e a saúde do celular (#371) entram na mesma seção
  com as issues deles.
- **Lembretes** (`Al-V2`) tem o "+" lima no topo, que abre a folha de lembrete (`Al-V3`); tocar
  num lembrete abre a mesma folha em modo edição (`Al-V3b`), com a lixeira. A folha é um sheet,
  não uma tela: voltar fecha a folha e fica em Lembretes.
- **Notificações** continua em `/profile/notifications` (a rota é a mesma desde a Fase 8c); a tela
  agora é a `Al-V4`.
