# ADR 028 — Imagens de posts da comunidade são armazenadas

**Status:** Proposed
**Data:** 2026-10-13

## Contexto

As ADRs 004 e 020 estabelecem que **foto de refeição não é armazenada**: ela trafega até a IA e
some. A infraestrutura não tem object storage, e isso é citado como benefício.

A timeline da comunidade precisa de posts com imagem (foto do treino, do prato, da turma). Uma
imagem de post é **conteúdo publicado** pela pessoa para outras pessoas — outra natureza que a
foto enviada para reconhecimento.

## Decisão

1. **Complementa** (não supera) as ADRs 004 e 020: foto de refeição para reconhecimento continua
   sem persistência. Só imagens **publicadas** em post (e avatares de perfil e de comunidade) são
   armazenadas.
2. **Storage S3-compatível**: Cloudflare R2 em produção, MinIO no compose local. Bucket privado;
   leitura por URL assinada de curta duração, emitida só para quem pode ver o post.
3. **Upload por URL pré-assinada** com tamanho e tipo limitados (JPEG/PNG/WebP, até 10 MB). Ao
   confirmar o post, a API reprocessa a imagem (`sharp`): **remove EXIF** (inclusive GPS),
   redimensiona e grava a versão final; o original é apagado.
4. **Ciclo de vida**: apagar o post apaga as imagens; `delete_my_account` apaga todas as imagens da
   pessoa; post removido por moderação mantém a imagem só para o autor até ele apagar.
5. `docs/DATA_RETENTION.md` e `docs/THREAT_MODEL.md` são atualizados com o novo ativo.

## Consequências

### Positivas

- Timeline com imagem, que é o que dá vida a uma comunidade.

### Negativas

- Novo serviço na infra, novo custo e nova superfície (conteúdo impróprio, vazamento por URL).
  Mitigações: URL assinada curta, moderação e denúncia (Fase 8), limites de upload.

### Neutras

- O backup do bucket entra no `infra/backup.sh`.

## Alternativas consideradas

- **Só texto na v1:** rejeitado pelo produto.
- **Guardar a imagem no Postgres:** rejeitado — infla backup e pgbouncer, sem ganho.
