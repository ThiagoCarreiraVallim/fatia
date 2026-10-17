# ADR 028 — Mídia publicada pela comunidade é armazenada

**Status:** Accepted (proposta em 2026-10-13; aceita e ampliada em 2026-10-17, Fase 7a)
**Data:** 2026-10-17

## Contexto

As ADRs 004 e 020 estabelecem que **foto de refeição não é armazenada**: ela trafega até a IA e
some. A infraestrutura não tinha object storage, e isso é citado como benefício.

A comunidade precisa publicar conteúdo com mídia. A proposta original pensava na timeline (Fase
8). A Fase 7 antecipou a necessidade:

- dicas com imagem e capa de plano pronto (7a);
- avatar da comunidade (7a, e o do agente na 7c);
- fotos e **vídeos** de execução dos exercícios do catálogo próprio da comunidade (7b): a academia
  grava os tutoriais com os aparelhos dela, e o influencer quer os vídeos que ele gravou.

Mídia publicada é **conteúdo** que alguém mostra a outras pessoas, de natureza diferente da foto
enviada para reconhecimento.

## Decisão

1. **Complementa** (não supera) as ADRs 004 e 020: foto de refeição para reconhecimento continua
   sem persistência. Só mídia **publicada** é armazenada: conteúdo da comunidade, avatares de
   comunidade e de agente, e, na Fase 8, imagens de post e avatar de perfil.
2. **Storage S3-compatível.**
   - Produção: Cloudflare R2.
   - Desenvolvimento: SeaweedFS no compose local, porque as imagens do MinIO saíram do Docker Hub.
   - Bucket privado: nada é público, e leitura é por URL assinada de curta duração (10 min),
     emitida só nas respostas de quem pode ver o conteúdo.
   - Configuração por `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`,
     `MEDIA_S3_ACCESS_KEY_ID` e `MEDIA_S3_SECRET_ACCESS_KEY`. O prefixo evita colidir com o
     `S3_*` do backup offsite (`infra/backup.sh`).
   - Sem elas, o envio responde 503 e o resto do produto segue igual.
3. **Upload direto, por URL pré-assinada.**
   - A API registra o arquivo como `MediaFile` pendente e assina um `PUT` com o tipo e o tamanho
     exatos: o storage recusa corpo de outro tamanho.
   - Ao confirmar, a API confere o objeto e:
     - **Imagem** (JPEG, PNG ou WebP, até 10 MB): reprocessa com `sharp`. Remove todo metadado,
       inclusive EXIF e GPS, gira conforme a orientação, limita a 1600 px, converte em WebP e
       apaga o original. Imagem com mais de 40 megapixels é recusada (bomba de descompressão).
     - **Vídeo** (MP4 ou MOV, até 200 MB, só na 7b): guardado como enviado, **sem conversão**.
       Converter exigiria fila e worker de vídeo, e o celular já grava em H.264/HEVC, que web e
       app tocam.
   - Pendente sem confirmação em 24 h é apagado por uma faxina periódica.
4. **Ciclo de vida.**
   - Trocar ou apagar o item (dica, capa, avatar) apaga o arquivo.
   - Apagar a comunidade apaga todos os arquivos dela.
   - `delete_my_account` apaga os arquivos que a pessoa enviou fora de uma comunidade e os das
     comunidades de que ela é dona (que caem junto com a conta). O que ela publicou numa comunidade
     de outra pessoa é da comunidade e fica, com autor anônimo.
   - Na Fase 8, post removido por moderação mantém a imagem só para o autor até ele apagar.
5. `docs/DATA_RETENTION.md` e `docs/THREAT_MODEL.md` registram o novo ativo, e a operação do R2
   (bucket, CORS, chave com escopo só do bucket) fica em `docs/OPERATIONS.md`.

## Consequências

### Positivas

- Conteúdo da comunidade com imagem e vídeo próprios, que é o que diferencia uma academia ou um
  criador de conteúdo do catálogo genérico.
- O arquivo não passa pela API no envio: a API de 512 MB não segura vídeo de 200 MB em memória.

### Negativas

- Novo serviço na infra, novo custo e nova superfície (conteúdo impróprio, vazamento por URL).
  Mitigações: bucket privado, URL assinada curta, limites de tipo e tamanho, só a equipe publica,
  moderação e denúncia (Fase 8).
- O custo do vídeo é armazenamento (R2 não cobra saída), proporcional ao que as comunidades
  publicam. Os limites de tamanho são o freio, e um teto por comunidade entra se o uso pedir.
- Vídeo sem conversão: um formato que algum navegador não toque fica para quem publicou trocar.

### Neutras

- O backup do bucket entra no `infra/backup.sh` (replicação do R2 para o offsite).
- URL assinada muda a cada leitura, então o navegador não guarda a imagem em cache entre visitas.
  Aceitável no volume atual.

## Alternativas consideradas

- **Só texto na v1:** rejeitado pelo produto.
- **Guardar a imagem no Postgres:** rejeitado. Infla backup e pgbouncer, sem ganho.
- **Vídeo por link do YouTube ou Vimeo:** sem custo, mas o produto escolheu o upload direto: quem
  publica não precisa de conta em outra plataforma, e o vídeo não fica público fora da comunidade.
- **Bucket público com nomes imprevisíveis:** rejeitado. Link vazado valeria para sempre, e sair da
  comunidade não tiraria o acesso.
- **Upload passando pela API (multipart):** rejeitado pelo tamanho do vídeo e pelo limite de
  memória da API.
