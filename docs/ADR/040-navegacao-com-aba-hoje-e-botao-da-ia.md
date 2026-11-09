# ADR 040 — Navegação com aba Hoje e o botão da IA à direita

**Status:** Accepted
**Data:** 2026-11-09

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

## Alternativas consideradas

- **Manter "+" no centro e "Mais" (navegação atual).** Rejeitada pelo redesign: o dia e a IA ficam
  a dois toques.
- **"Registrar" no centro e IA dentro dele** (versão de Componentes do canvas). Rejeitada pelo dono
  do produto em favor do botão da IA à direita.
