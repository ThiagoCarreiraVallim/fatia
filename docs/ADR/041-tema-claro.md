# ADR 041 — Tema claro que segue o sistema, e contraste da cor da comunidade

**Status:** Accepted
**Data:** 2026-11-14
**Revê:** a linha "Tema claro" da tabela "Em discussão" do PRD §5 ([#352](https://github.com/ThiagoCarreiraVallim/fatia/issues/352)) e o princípio "Só tema escuro" do `docs/DESIGN.md`

## Contexto

O Fatia nasceu só escuro: uma paleta, testada para contraste, e o `DESIGN.md` dizia "Só tema
escuro". O tema claro ficou como item "em discussão" do PRD (#352), e pela
[ADR 037](./037-prd-descreve-o-produto-atual.md) só entra com ADR.

O redesign (história #367, design system "Fatia Noite" na #368) desenha o escuro como padrão e traz
a paleta clara pronta, com os **mesmos nomes de token**, num quadro "Tema claro · proposta (#352)".
O dono do produto decidiu que o claro entra funcional agora, e não como proposta.

O mesmo quadro do canvas define a cor da comunidade (`--b`), que aparece na capa, na aba ativa e no
botão principal dentro da comunidade. Cor escolhida pela equipe é cor que ninguém testou: um roxo
`#7C5CFF` dá 4,35:1 com texto branco e 4,28:1 com texto escuro — abaixo de 4,5:1 nos dois. E um
verde parecido com o do Fatia confunde a comunidade com a marca e com o "dentro da meta".

## Decisão

### Tema

1. **App e web seguem o tema do sistema** (`prefers-color-scheme` na web, `useColorScheme` no app).
   O escuro continua o padrão visual do canvas e de toda prancha.
2. **Escolha manual em Você: Sistema · Escuro · Claro.** É preferência de interface, guardada no
   aparelho (`localStorage` na web, armazenamento local no app). **Não vai à API** nem ao export:
   não é dado da pessoa, é ajuste da tela, como o `docs/CLAUDE.md` permite para `localStorage`.
3. **Mesmos nomes de token, dois blocos de valores.** `globals.css` (web) e `global.css` (app)
   ganham o bloco claro com os mesmos nomes; `palette.test.ts` e `cores.test.ts` passam a conferir a
   paridade dos dois blocos. Valores claros do canvas (`canvas.css`, classe `.light`):

   | Token       | Escuro    | Claro     | Por quê                                              |
   | ----------- | --------- | --------- | ---------------------------------------------------- |
   | fundo       | `#131313` | `#F4F5F2` |                                                      |
   | superfície  | `#1F1F1F` | `#FFFFFF` |                                                      |
   | texto       | `#E5E2E1` | `#141613` |                                                      |
   | proteína    | `#6EA3FF` | `#2563EB` | 4,7:1 sobre o fundo claro                            |
   | carboidrato | `#2CE500` | `#1A7F00` | o verde da marca não passa 4,5:1 sobre claro (1,6:1) |
   | gordura     | `#FFB4AB` | `#B93A2E` |                                                      |
   | água        | `#60A5FA` | `#1A66C2` |                                                      |
   | passos      | `#2DD4BF` | `#0E7468` |                                                      |

   Carbo, gordura, água e passos claros passam 4,5:1 sobre branco e sobre o fundo claro e podem
   ser texto. A proteína clara `#2563EB` é a do `canvas.css`; a decisão do dono fixou as outras
   quatro, e esta segue o canvas, que vence o `DESIGN.md`.

4. **O verde da marca `#2CE500` no tema claro é só superfície** (botão, anel, aba ativa com texto
   `#0B1A05` por cima), nunca texto sobre o fundo claro.
5. **Tipografia:** Sora para números e títulos, Manrope para texto, nos dois temas (canvas, #368).
6. **Telas:** toda tela do redesign é feita com tokens, então funciona nos dois temas; o `ui:snap`
   e o axe rodam nos dois. Cor literal em componente continua defeito.

### Cor da comunidade

7. **Texto sobre a cor da comunidade é branco `#FFFFFF` ou escuro `#131313`**, o que passar
   4,5:1 (se os dois passam, o de maior contraste).
8. **Cor que não passa 4,5:1 com nenhum dos dois** gera aviso no editor de marca e a sugestão do
   **tom mais próximo que passa com folga**: mesma matiz, escurecido (ou clareado) até passar
   **5:1** com um dos textos — a folga existe porque o tom que passa raspando (`#7857FF`, 4,56:1)
   fica ilegível em tela com brilho baixo. O caso do canvas, fixado no teste, é `#7C5CFF` (4,35:1
   com branco) → `#6A4AE0` (5,72:1 com branco); o algoritmo exato (espaço de cor e passo) é da
   implementação, desde que reproduza esse caso. A equipe pode aceitar a sugestão ou escolher outra
   cor; a cor que não passa **não é gravada**.
9. **Cor próxima do verde do Fatia é recusada**, com o motivo na tela. "Próxima" é distância de
   cor perceptual (CIEDE2000) menor que 15 em relação a `#2CE500`; o limite exato fica fixado no
   teste da implementação.
10. **Uma validação só, compartilhada.** Função pura em `packages/api-client` (que web e app já
    usam), importada também pela API — que passa a depender do pacote só para isso. A API
    **rejeita** (400 com o motivo e a sugestão); os clientes **avisam** antes de enviar. Casos
    mínimos do teste: `#7C5CFF` → aviso + `#6A4AE0`; `#2CE500` e vizinhos → recusada; cor que
    passa com branco ou com escuro → aceita. Implementação na #372 (editor de marca) e na #410
    (páginas de boas-vindas); absorve a sobra #314 registrada na #418.
11. A cor da comunidade aparece só em capa, aba ativa, botão principal, convite, e-mail e card;
    nunca em macro, estado, anel ou barra (canvas, #368).

## Consequências

### Positivas

- Quem usa o celular no claro deixa de ver o único app escuro da tela; a escolha manual cobre quem
  quer o contrário.
- Contraste da comunidade garantido no servidor: nenhuma tela recebe uma cor ilegível, venha ela do
  painel, da API ou de um cliente antigo.

### Negativas

- Toda tela passa a ter duas aparências para conferir: `ui:snap` e axe dobram.
- `palette.test.ts` e `cores.test.ts` ganham o bloco claro; um token novo precisa dos dois valores.
- A API ganha dependência de `@fatia/api-client` só para a validação de marca.

### Neutras

- O MCP não muda: tema é coisa da tela.
- Os tokens, as fontes e a tabela do `DESIGN.md` mudam junto, na #368, porque o `cores.test.ts`
  lê a tabela do `DESIGN.md`.

## Alternativas consideradas

- **Só escuro (manter o PRD).** Rejeitada pelo dono do produto: o canvas já entrega a paleta clara,
  e o custo de manter os dois é o teste de paridade, que já existe.
- **Claro como proposta, decidido depois (recomendação da #368).** Rejeitada: deixaria tokens
  claros sem uso, que envelhecem sem ninguém ver.
- **Preferência de tema na API.** Rejeitada: não é dado da pessoa, e sincronizar entre aparelhos não
  vale uma coluna e um campo no export.
- **Recusar toda cor que não passa.** Rejeitada: a equipe escolhe a cor da marca dela; sugerir o tom
  mais próximo resolve sem tirar a escolha.
- **Validação só no cliente.** Rejeitada: a API aceitaria a cor ilegível de qualquer outro caminho.
