# ADR 030 — Catálogo de exercícios da comunidade: tutorial por cima, não cópia

**Status:** Accepted  
**Data:** 2026-10-17

## Contexto

Na Fase 7 a comunidade passou a publicar conteúdo dela. Para exercícios, o pedido foi:

- a academia mostra **só o equipamento que tem** e põe nas execuções as fotos, os vídeos e as dicas
  dela, gravados com os aparelhos da casa;
- o influencer quer que **todos os tutoriais** sejam os vídeos que ele gravou;
- quem treina vê primeiro o que a comunidade destaca, com um filtro "Na minha academia", e continua
  com o catálogo geral à mão.

`Exercise` tinha dois tipos de linha: o catálogo público (`createdByUserId` nulo) e o exercício
pessoal (com dono). O plano e o histórico de cada pessoa apontam para `exerciseId`. E nove lugares do
código tratavam "`createdByUserId` nulo" como "público": busca, detalhe, registrar série, prescrição,
recorde, prévia do chat, snapshot de plano, materializador e o plano pronto da 7a.

## Decisão

1. **Tutorial é sobreposição.** `GroupExerciseGuide { groupId, exerciseId, vídeo, fotos (até 4),
dicas }` fica por cima de qualquer exercício: do catálogo geral ou da comunidade. O plano e o
   histórico continuam no mesmo `exerciseId`; trocar o vídeo não mexe em plano de ninguém. O
   detalhe do exercício traz o tutorial da comunidade da pessoa (a primeira em que ela entrou, se
   houver mais de uma), e o vídeo dela substitui o do YouTube.
2. **Exercício da casa** é uma linha de `Exercise` com `groupOwned = true` e `groupId`. Sempre nasce
   com o tutorial (é onde fica o autor). Nome único dentro da comunidade.
3. **O catálogo público passa a ser `createdByUserId` nulo e `groupOwned` falso**, num helper só
   (`workout/helpers/exercise-access.ts`): `CATALOG_EXERCISE`, `searchableExercises` (catálogo,
   pessoal e o das comunidades ativas) e `readableExercises` (o mesmo, mais o exercício de
   comunidade que já está num plano ou numa série da pessoa). Os nove lugares usam o helper.
4. **`groupOwned` é imutável; `groupId` não.** O FK de `groupId` é `SetNull`: apagar a comunidade,
   ou a equipe apagar um exercício que alguém já usa, solta o exercício da comunidade. Ele some da
   busca e fica no histórico de quem treinou com ele. Sem a marca imutável, a linha solta (sem dono e
   sem comunidade) viraria catálogo de todo mundo. Dois `CHECK` no banco seguram a forma:
   exercício de comunidade não tem dono pessoa, e só exercício de comunidade aponta para uma.
5. **Equipamento da academia** é `Group.equipment`, da lista que o catálogo usa. "Na minha academia"
   (`onlyMyGym`) mostra o que a comunidade destaca e o que dá para fazer com o equipamento dela,
   mais peso corporal. A busca põe o que a comunidade destaca primeiro e diz qual comunidade
   (`communityName`).
6. **Plano pronto com exercício da casa** viaja por referência (`source: 'group'` no snapshot v1),
   aceito só na adoção de plano pronto **da mesma comunidade**. Fora dela (oferta do profissional,
   outra comunidade) vai por valor, como o exercício pessoal. Plano pronto que usa o exercício
   segura a remoção dele.
7. **Vídeo** é o da ADR 028 (MP4 ou MOV até 200 MB, sem conversão), com uma conferência a mais: a
   confirmação lê os primeiros bytes (`Range`) e exige a caixa `ftyp`. O agente (MCP) recebe o
   tutorial resumido, sem URL.

Exercício da comunidade cria ciência de grupo em `workout/`, que a ADR 014 evitava. Aqui é leitura
de conteúdo publicado pela comunidade, não de dado de saúde de ninguém, e fica num helper só, sem
service de grupo dentro de `WorkoutModule`. A gestão (criar, tutorial, equipamento) mora em
`sharing/group-exercise.service.ts`.

## Consequências

### Positivas

- O tutorial aparece em todo lugar que já mostrava o exercício (plano, treino, sessão, seletores),
  sem migrar plano nem histórico de ninguém.
- Um helper único para "quem vê qual exercício". Escrevê-lo achou um furo antigo: `addExercise`
  aceitava o exercício pessoal de outra pessoa pelo id sequencial (#92), agora conferido.
- Apagar comunidade, conta da dona ou exercício nunca apaga treino de ninguém nem publica o
  exercício para todo mundo — garantido também pelo banco.

### Negativas

- Exercício solto (sem comunidade, em uso) fica no banco enquanto alguém o tiver no plano ou no
  histórico, sem tela para gerir.
- Quem está em duas comunidades vê o tutorial de uma só (a mais antiga).
- O app abre o vídeo no navegador do sistema, não num player próprio: um player nativo é
  dependência nativa nova e pediria build.

### Neutras

- O catálogo da comunidade não tem rascunho: o exercício e o tutorial aparecem ao salvar.

## Alternativas consideradas

- **Clonar o exercício para a comunidade** (como o exercício pessoal faz com `clonedFromId`): o
  plano e o histórico de quem já treinava apontam para o original, e o tutorial não apareceria
  neles sem migrar dados de cada pessoa.
- **`groupId` sozinho, sem marca imutável:** a cascata `SetNull` transformaria exercício da
  comunidade em catálogo público. `Restrict` no FK travaria apagar a comunidade (e a conta da dona,
  um direito da LGPD) sempre que alguém usasse o exercício.
- **Tutorial dentro de `Exercise`** (colunas de vídeo e dicas): o mesmo exercício do catálogo tem um
  tutorial por comunidade.
