# ADR 041 — Tema claro com escolha do usuário

**Status:** Accepted
**Data:** 2026-11-14

## Contexto

Desde o começo o Fatia é só escuro: `html.dark` fixo no PWA, `userInterfaceStyle: 'dark'` no app,
e o `docs/DESIGN.md` listava "Só tema escuro" entre os princípios. O PRD §5 deixou "Tema claro" na
tabela **Em discussão** (#352), e pela [ADR 037](./037-prd-descreve-o-produto-atual.md) só uma ADR
tira um item de lá.

O design system v2 "Noite" (#368) desenhou a proposta do claro no canvas (prancha Main, "Tema
claro · proposta (#352)") com os **mesmos nomes de token** do escuro, e o dono do produto decidiu
que o claro entra funcionando nesta etapa: app e web seguem o sistema, com escolha manual.

Quem usa o app na academia, de dia, ao ar livre ou com o brilho baixo, lê melhor no claro; e o
sistema operacional de muita gente já está no claro, o que faz o Fatia parecer "fora do lugar".

## Decisão

1. **Dois temas, mesmos nomes.** Os tokens do claro usam os nomes do escuro (`background`, `card`,
   `foreground`, `protein`…). A fonte é `packages/design/src/tokens.ts`; os CSS do PWA, do app e do
   site repetem os valores e um teste confere os três.
2. **Segue o sistema por padrão; a pessoa pode escolher.** Perfil → Aparência oferece **Sistema,
   Escuro e Claro**. É preferência de interface, guardada no aparelho (`localStorage` na web,
   `SecureStore` no app, chave `fatia.theme`) — não vai para a conta nem para a API. Valor ausente
   ou inválido vale "Sistema"; sem resposta do sistema, escuro.
3. **Cores do claro:** fundo `#f4f5f2`, cartão branco; carboidrato `#1a7f00`, gordura `#b93a2e`,
   água `#1a66c2`, passos `#0e7468`, proteína `#2563eb` — todas passam 4,5:1 sobre o fundo e o
   cartão e podem ser texto. Perigo, aviso e sucesso ganham tons próprios para o claro
   (`#b42318`, `#8a5a00`, `#0b7a50`), porque os do escuro ficam abaixo de 3:1 sobre branco.
4. **O verde da marca só como superfície no claro.** `#2ce500` com texto branco dá 1,7:1; como
   texto ou ícone sobre o claro, usa-se `primary-text` (`#1a7f00`). `text-primary` aponta para ele
   nos dois temas.
5. **Sem flash:** na web um script inline no `<head>` aplica o tema antes da pintura; no app a
   preferência é lida antes de esconder a splash.
6. **O site** (`apps/site`) segue o sistema, sem seletor.
7. A #352 é absorvida por esta ADR e pela #368; a linha "Tema claro" sai da tabela "Em discussão"
   do PRD §5.

## Consequências

### Positivas

- O app combina com o sistema de quem usa, e quem lê mal no escuro tem saída.
- Contraste AA nos dois temas passa a ser testado (`tokens-contrast.test.ts`), não só lembrado.

### Negativas

- Toda cor literal vira defeito em dobro: some num dos temas. O app tinha centenas de usos de cor
  em JS; `colors` (antes `cores`) passou a ler o tema vigente, e cor guardada em constante de
  módulo congela o tema do carregamento.
- `ui:snap` e o axe passam a rodar nos dois temas: o dobro de fotos para revisar.
- Os tons de estado do claro não vieram do canvas e pedem revisão de design.
- No app, trocar o tema remonta a árvore de telas para as cores em JS acompanharem.

### Neutras

- O MCP e a API não mudam: tema é coisa da tela.

## Alternativas consideradas

- **Continuar só escuro.** Rejeitada pelo dono do produto no redesign.
- **Tema claro sem escolha manual (só o sistema).** Rejeitada: quem treina com o celular no
  sistema claro pode preferir o escuro no app, e vice-versa.
- **Guardar a preferência na conta.** Rejeitada: é preferência do aparelho (o tablet da academia e
  o celular podem querer coisas diferentes) e não vale uma coluna nem uma ida à API.
