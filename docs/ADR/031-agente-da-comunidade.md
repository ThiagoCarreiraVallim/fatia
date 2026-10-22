# ADR 031 — Agente da comunidade: persona por cima do mesmo assistente

**Status:** Accepted
**Data:** 2026-10-17

## Contexto

Na Fase 7 a comunidade passou a ter conteúdo próprio (planos e dicas na 7a, catálogo de exercícios
na 7b). O pedido da 7c foi que ela tenha também **o próprio agente** no chat: nome, foto ou ícone e
instruções dela. A pessoa escolhe no chat com quem conversar, e o padrão é o agente da comunidade
que paga o assento dela.

O chat (ADR 015, 022, 023) tem um prompt fixo (`SISTEMA`), que é parte do que se mede no benchmark,
e um recorte de três camadas que decide o que o modelo pode chamar. As tools usam o Bearer de quem
conversa: o agente não tem outra forma de ler dado. Texto de terceiro (resultado de tool, memória)
entra cercado como dado (`cercar`).

## Decisão

1. **Persona, não outro agente.** `GroupAgent { groupId, name, instructions, avatarFileId?,
enabled }`, um por comunidade, configurado pelo dono (`group.update`). O chat continua o mesmo
   grafo, o mesmo catálogo de tools e o mesmo recorte; a comunidade muda nome, avatar e
   orientações de tom e foco.
2. **Onde as orientações entram.** Depois do fixo e da data, antes da memória, com a frase de que
   "tudo o que está acima continua valendo e vem antes". As orientações vão **cercadas**
   (`ORIENTAÇÕES DA COMUNIDADE`), e o texto diz o que elas não autorizam: pular a aprovação da
   pessoa, ler ou comentar dado de outra pessoa, diagnóstico ou dose, se passar por pessoa ou
   profissional de saúde. O nome fica fora da cerca, numa frase: a API recusa quebra de linha e
   `<`/`>` nele, e o agente limpa de novo (também o nome da comunidade, que não passa por essa
   validação).
3. **A escolha é gravada na conversa** (`Conversation.agentGroupId`, `SetNull`) quando ela nasce.
   Ausente é o padrão (a comunidade do assento, se o agente dela estiver ligado); `null` é o
   assistente da Fatia; um id fora das opções é 404 antes de qualquer gasto. Conversa que já
   existe ignora o que vier no corpo. Trocar de agente é começar outra conversa: a mesma thread
   com duas personas misturaria vozes no histórico.
4. **A persona é conferida a cada turno**, pela API, e viaja no contexto do turno (como a memória),
   não no checkpoint. Quem saiu da comunidade, ou cujo dono desligou o agente, segue a mesma
   conversa com o assistente da Fatia.
5. **O agente usa o conteúdo da comunidade pelas tools que já existem:** a persona traz o id da
   comunidade para `list_group_plans` e `list_group_tips`, e lembra do `onlyMyGym` da busca de
   exercícios. Nenhuma tool nova, nenhuma leitura fora do Bearer.
6. **Avatar** é mídia da comunidade (ADR 028), propósito `agent_avatar`; sem um, vale o da
   comunidade.

## Consequências

### Positivas

- O que segura de verdade não depende do texto: a orientação que mandar "gravar sem perguntar"
  esbarra na pausa do grafo, e a que mandar "ler os dados de todos" não tem tool que a atenda.
- Quatro casos novos no benchmark (`persona-*`) tentam passar por cima das regras pela orientação;
  12 de 12 com `z-ai/glm-5.3-flash` na rodada de 17/10/2026.
- Nada muda para quem não está numa comunidade com agente ligado: o prompt é byte a byte o de antes.

### Negativas

- A orientação é texto de terceiro no prompt de sistema. A cerca e a ordem reduzem, não eliminam,
  a chance de um modelo pequeno seguir uma orientação ruim no tom (por exemplo, prometer
  resultado). O benchmark mede os casos graves; o tom fica com o dono, que responde pelo que
  escreve.
- O app não tem chat: lá o dono só configura.

### Neutras

- O custo do turno não muda de pagador: quem paga é quem já pagava (assento ou assinatura).

## Alternativas consideradas

- **Prompt próprio da comunidade no lugar do `SISTEMA`:** as regras de segurança e o que se mede
  no benchmark passariam a variar por comunidade.
- **Um agente separado, com tools escolhidas pela comunidade:** abre a pergunta de quem autoriza
  cada tool e duplica o recorte da ADR 022.
- **Persona no checkpoint:** ficaria velha no primeiro "desligar" do dono ou na saída da pessoa.
- **Trocar de agente no meio da conversa:** o histórico teria duas vozes, e o modelo responderia
  pela persona nova sobre o que a outra disse.
