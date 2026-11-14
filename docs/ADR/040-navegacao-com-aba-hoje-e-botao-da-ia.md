# ADR 040 — Navegação com aba Hoje e o botão da IA à direita

**Status:** Accepted (revisada em 2026-11-14)
**Data:** 2026-11-09

> **Revisão de 14/11/2026 (#368).** O canvas foi revisto em 10/11 (prancha Componentes, "Barra de
> navegação", e `.nav.n5` em canvas.css): a barra passou a ter **cinco abas**, com **Você** como
> aba. A seção "Revisão" no fim substitui os itens 1, 3 e 5 da decisão original; o resto continua.

## Contexto

A navegação atual (`packages/api-client/src/navigation.ts`, `docs/DESIGN.md`) tem a barra
**Nutrição · Treino · [+] Registrar · Comunidade · Mais**, sem aba Início: o Início é a raiz, e o
resto das telas mora no menu "Mais".

O redesign coloca o dia no centro do app e a IA a um toque de qualquer tela. O canvas tinha duas
versões (o "Registrar" no centro, em Componentes, e o botão da IA à direita, na tela principal); o
dono do produto escolheu a da tela principal.

## Decisão

1. **Barra de baixo:** **Hoje · Nutrição · Treino · Comunidade**, e à direita, separado das abas,
   um **botão redondo da IA**.
2. **O botão da IA abre um menu de baixo** ("O que vamos registrar?") com:
   - **registro manual**: refeição, água, peso, **passos**, treino — e hábito e check-in quando
     existirem (#328, #321);
   - **foto do prato** e o campo para falar com a IA;
   - as conversas recentes e sugestões.

   Para quem está no FREE, o registro manual e a foto bloqueada (com a oferta do PRO) aparecem; o
   registro nunca depende da IA (PRD §3.1).

3. **"Mais" deixa de existir.** O perfil, as metas, o progresso, os recordes, as notificações, o
   plano e "Conectar sua IA" passam a ser acessados pelo **avatar no topo do Hoje** (área "Você").
   O sino de avisos fica ao lado do avatar.
4. **A aba Hoje é a raiz.** O voltar hierárquico continua (`ROUTES`), agora subindo até o Hoje.
5. **Desktop:** a barra lateral mostra as quatro abas, a área Você e o botão da IA no topo.
6. **Uma fonte de verdade continua** em `navigation.ts`, usada pelo web e pelo app.

## Consequências

### Positivas

- O dia vira a primeira tela, e a IA e o registro ficam a um toque de qualquer aba.
- Uma aba a menos no fundo libera espaço para rótulos maiores.

### Negativas

- O "+" Registrar no centro some: quem registra sem IA passa pelo menu do botão da IA. O menu
  precisa abrir com o **registro manual primeiro**, para o FREE não parecer bloqueado.
- Telas que hoje estão no "Mais" ficam a um toque a mais (avatar → item).
- Muda `navigation.ts`, os dois layouts (web e app), `quick-add`, os testes de navegação, as fotos
  do `ui:snap` e o `docs/DESIGN.md` (que hoje diz "não há aba Início").
- A transição em que a tela encolhe e vira um "notch" acima do menu é cara de fazer bem nos dois
  clientes; um menu de baixo comum (como o "+" atual) é a primeira entrega aceitável.

### Neutras

- O conector MCP não muda: navegação é coisa da tela.

## Revisão (2026-11-14)

1. **Cinco abas, só ícone:** **Hoje** (`home`) · **Nutrição** (`apple`) · **Treino** (`dumbbell`)
   · **Comunidade** (`users`) · **Você** (avatar). Sem rótulo visível, por espaço; toda aba tem
   nome para leitor de tela (`aria-label`/`accessibilityLabel`) e a ativa tem `aria-current`
   (ganha o fundo `foreground` com o ícone em `background`).
2. **Botão redondo da IA** (68 px, `spark`, verde da marca) à direita, separado das abas.
3. **"Você" vira aba** (no lugar do avatar no topo do Hoje): perfil, metas, progresso, recordes,
   plano, "Conectar sua IA", Aparência e o item **Avisos**. O **sino de avisos** continua no topo
   do Hoje. (As telas Al-H1-Hoje e Al-V1-Voce não estão na cópia local do canvas; a posição exata
   do sino se confere no canvas online antes da #369.)
4. **Quando a barra some:** nas tarefas de foco (treino em andamento, câmera, chat, criar ou
   editar algo, compra). Ela fica **por baixo das folhas**. Nas telas de ver com ação principal, o
   botão de ação sobe para cima da barra. O **voltar do sistema fecha o menu da IA**, como qualquer
   folha.
5. **Desktop:** barra lateral com as cinco abas e o botão da IA no topo. O painel da comunidade
   fica dentro de Comunidade.
6. **Hábito e check-in** só aparecem no menu da IA quando a #390 existir; até lá, não aparecem.
7. O componente visual (barra de 5 abas + botão da IA, nos dois temas) entra com a #368; a troca
   da navegação (`navigation.ts`, layouts, testes) é da #369.

## Alternativas consideradas

- **Manter "+" no centro e "Mais" (navegação atual).** Rejeitada pelo redesign: o dia e a IA ficam
  a dois toques.
- **"Registrar" no centro e IA dentro dele** (versão de Componentes do canvas). Rejeitada pelo dono
  do produto em favor do botão da IA à direita.
