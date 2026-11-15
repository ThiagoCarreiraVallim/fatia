# ADR 038 — A foto da refeição passa a ser guardada, com consentimento

**Status:** Accepted
**Data:** 2026-11-09
**Supera:** [ADR 004](./004-sem-armazenamento-fotos.md) · **Altera:** [ADR 020](./020-foto-e-audio-trafegam-sem-persistencia.md), item 1, só para a foto da refeição

## Contexto

A ADR 004 decidiu não guardar foto de refeição quando o Fatia era um app de dez pessoas, e já dizia
"reavaliar se virar produto público". A ADR 020 confirmou a regra para a IA hospedada: foto e áudio
trafegam e somem.

O produto mudou. Com comunidades, personais e nutricionistas, a foto é o que dá contexto ao número:
"o almoço de 900 kcal" diz pouco; a foto do prato diz o resto. O redesign coloca a foto na
refeição (o dia, a refeição registrada, o histórico), e o dono do produto decidiu guardá-la.

Foto de refeição é dado sensível de contexto: mostra o prato, mas também a casa, quem está à mesa e
a rotina. Por isso a decisão vem com consentimento, recorte de quem vê e prazo de vida.

## Decisão

1. **Guardar é escolha da pessoa.** Na primeira foto de refeição o app pergunta "Guardar as fotos
   das refeições?". A resposta vira uma opção no perfil, que muda a qualquer momento. Enquanto ela
   não responder, ou se recusar, nada muda em relação a hoje: a foto vai à IA e é descartada.
2. **Onde fica.** No bucket privado de mídia (ADR 028), como `MediaFile` ligado à refeição: EXIF
   removido no aparelho e de novo no servidor, recodificada em WebP, leitura só por URL assinada de
   curta duração. Uma foto por refeição.
3. **Quem vê.** A própria pessoa. A equipe de uma comunidade só vê com uma **categoria de
   compartilhamento nova, "Fotos das refeições"**, separada de Alimentação (ADR 026). Quem já
   compartilha Alimentação continua compartilhando só os números — nenhuma foto passa a ser vista
   sem um aceite novo.
4. **Foto enviada no chat.** É guardada só quando vira refeição (a IA registra a refeição a partir
   dela). Imagem de outra coisa — rótulo, pergunta, um exercício — continua descartada (ADR 020).
5. **Prazo.** A foto vive enquanto a refeição existir. Apagar a foto, a refeição ou a conta apaga o
   arquivo; a cópia do backup some no prazo do `DATA_RETENTION.md`. A foto entra no export LGPD.
6. **Provedor de IA.** Nada muda: o que vai ao modelo continua sem identificador da pessoa e com as
   regras dos itens 2 a 7 da ADR 020.
7. **Conector MCP.** As tools de refeição informam se há foto. Não há tool que mande a foto à IA
   hospedada (ADR 018).
8. **Áudio.** Nada muda: o áudio do ditado continua sem persistência (ADR 020).

Os itens 1, 3, 4 e 5 são os padrões desta decisão e podem ser revistos por outra ADR antes da
implementação, sem reabrir o item principal (a foto passa a ser guardada).

## Consequências

### Positivas

- O dia e o histórico ganham contexto visual; o profissional autorizado entende o registro.
- Uma estimativa errada pode ser revista olhando a foto.
- O consentimento separado mantém a promessa da ADR 026: ninguém da equipe vê mais do que foi aceito.

### Negativas

- Dado sensível novo parado no servidor: entra no `THREAT_MODEL.md`, na `/privacy`, no
  `DATA_RETENTION.md` e no relatório de impacto (LGPD).
- O backup do bucket deixa de ser opcional (#349): perder o bucket passa a perder dado do aluno.
- Os textos de permissão do app (`apps/mobile/app.config.ts`) que dizem "a foto é analisada e
  descartada" mudam para refletir a escolha.
- Custo de armazenamento: WebP de ~150 KB; quem fotografa 5 refeições por dia gera ~22 MB/mês. Mil
  pessoas assim somam ~22 GB/mês, centavos de dólar no R2 — irrelevante no piloto, a revisar com escala.
- Schema: ligação `Meal` ↔ `MediaFile`, `ShareScope` novo, preferência de guardar fotos.

### Neutras

- A tela de revisão da foto (confirmar os itens antes de salvar) não muda.

## Alternativas consideradas

- **Guardar sempre, sem perguntar.** Rejeitada: foto de refeição é dado sensível de contexto; a LGPD
  pede consentimento específico, e a promessa atual do app é o contrário.
- **Junto com a categoria Alimentação.** Rejeitada: mudaria o que milhares de aceites já disseram, e
  obrigaria a pedir consentimento de novo a todos.
- **Prazo fixo (90 dias ou 12 meses).** Rejeitada por ora: a foto vale enquanto a refeição vale;
  revisitar quando o custo de armazenamento importar.
- **Continuar sem guardar (ADR 004).** Rejeitada pelo dono do produto: o valor para quem acompanha o
  aluno passou a pesar mais que a simplicidade.

## Nota — redesign (#370, 2026-11-14)

A conferência tela × banco do redesign ([`DADOS_REDESIGN.md`](../DADOS_REDESIGN.md)) confirma os
padrões desta ADR, sem mudar nenhum item:

- **Categoria 6, "Fotos das refeições"**, separada das cinco do `ShareScope` (`WORKOUT`,
  `NUTRITION`, `BODY`, `HABITS`, `GOALS`). É valor novo no enum, com linha nova na tabela de leitura
  do `PERMISSIONS.md` no mesmo PR que muda o código (até lá, na seção "Planejado" do documento).
  Para a nutricionista ela só vale se a pessoa a liberar ([ADR 043](./043-papeis-da-equipe.md)).
- **Preferência "Guardar fotos das refeições"** em Você → Conta (`Al-V1-Voce`), além da pergunta na
  primeira foto (item 1).
- **Descarte:** foto de rótulo, foto de pergunta e áudio do ditado continuam sem persistência
  (itens 4 e 8).
- **Issues donas:** schema `Meal` ↔ `MediaFile`, "Apagar só a foto" e a categoria nova (#374); foto
  do prato e o fluxo da câmera (#385); a opção no perfil (#387); a pergunta no onboarding,
  `Onb-03` (#371).
- **Foto de desafio é outra regra:** prova de check-in vista só pela equipe que revisa, com prazo
  próprio ([ADR 044](./044-desafios-com-revisao.md)). Ela não entra nesta categoria.

## Nota — implementação (#374, 2026-11-15)

O que entrou, sem mudar a decisão:

- `Meal.photoFileId` aponta para um `MediaFile` privado (`purpose = meal_photo`, chave
  `users/{userId}/{id}.webp`), reencodado em WebP sem EXIF pelo mesmo pipeline do avatar. Uma foto
  por refeição; não há trocar, só "Apagar só a foto" (`DELETE /api/nutrition/meals/:id/photo` e a
  tool MCP `delete_meal_photo`).
- A foto é guardada **no reconhecimento** só com `keepMealPhotos = true`, e fica sem dono até a
  refeição nova chegar com `photoFileId`. A faxina apaga a foto que não virou refeição em até
  2 h (1 h de prazo + o intervalo da faxina). Com a preferência `null` ou `false`, nada é guardado.
- A preferência continua a coluna `keepMealPhotos` da #387 (o rascunho falava em
  `storeMealPhotos`). O app pergunta na primeira foto; o PWA não tem câmera de refeição.
- Só refeição **nova** recebe a foto. Foto tirada para somar itens a uma refeição que já existe é
  descartada (sem a pergunta de qual foto vale).
- `ShareScope.MEAL_PHOTOS` existe e nunca vem junto de `NUTRITION`; a leitura da equipe registra
  `ProfessionalAccessLog` como as outras categorias.
- O export LGPD leva os metadados da foto; o link de baixar leva URL assinada de 24 h. A foto sai do
  bucket ao apagar a foto, a refeição ou a conta.
- `MealItem.source` (`MANUAL`, `AI`, `PLAN`, `BARCODE`) pinta o selo "IA". As tools MCP de refeição
  gravam `AI` quando a origem não vem.
