# Validação visual contra o canvas

Toda tela do redesign só fica pronta depois de comparada com a prancha, em imagem, lado a lado, na web e no app. Teste e captura que só "passa" não basta.

## Ferramentas

- **Prancha:** `node scripts/render-board.mjs <saída> Al-N1-Dia [outras...]`.
  - Roda o script `x-dc` com o runtime do canvas (`.canvas/artifact-type/dc-runtime.js`) e abre o conteúdo rolável inteiro.
  - Os ícones saem como o nome escrito (ex.: `scan`, `book`, `target`), porque os SVGs das máscaras não vêm na cópia local.
  - Para ver o glifo real de um ícone, use o equivalente do Lucide.
- **Web logada (demo):** `node scripts/shot-web.mjs <saída> /rota "/rota@click=Texto" [--desktop] [--light]`.
  - Gera o print da tela visível (os elementos fixos ficam no lugar real) e o da página inteira.
- **App (Expo Go no emulador, já logado como demo):** `flock /tmp/fatia-emu.lock scripts/emu-shot.sh open /nutrition`, depois `... shot <arquivo>`, `... tap "Texto"`, `... dump`, `... scroll`, `... back`.
  - Rode sempre com `flock`: há um emulador só.
- Para olhar um PNG, use a ferramenta Read.

## O que comparar, em cada tela

1. **Estrutura**, na mesma ordem que a prancha:
   - header (título, botões do topo e seus ícones);
   - seletores (ex.: a faixa de dias da semana);
   - cards e seções;
   - nada sobrando que a prancha não tem (ex.: cards velhos);
   - nada faltando.
2. **Visual:** tamanhos de título, raio dos cards, cores dos tokens, espaçamento, peso da fonte e textos.
3. **Sobreposição:**
   - o menu flutuante e o botão da IA nunca podem cobrir o conteúdo, os botões de modal, folha ou drawer, nem o fim da lista;
   - com uma folha aberta, o menu fica escondido ou abaixo dela.
4. **Tema escuro:** nada de texto preto ou cinza-escuro em fundo escuro; o mesmo vale ao contrário no claro, se a tela suportar.
5. **Estados:** vazio, carregando, erro e o modal ou folha aberta.

A interação pode ser melhor que a prancha (campo digitável, confirmação etc.), mas o desenho segue a prancha.

## Entrega

No relatório vai, para cada tela:

- a lista de diferenças achadas e o que foi corrigido;
- os caminhos dos prints de prancha, web e app, depois da correção.
