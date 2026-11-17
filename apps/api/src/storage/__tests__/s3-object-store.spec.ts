import { S3ObjectStore } from '../s3-object-store';

/**
 * O que este arquivo protege não é o SDK, é o que a **URL gerada** diz.
 *
 * Os dois defeitos abaixo não aparecem contra o `MemoryObjectStore`: eles moram
 * na query string, e só o bucket de verdade reclamaria (medido no b09bd65, contra
 * o mesmo `@aws-sdk/s3-request-presigner`).
 *
 * 1. `ContentType` no comando **não** entra na assinatura sozinho, só
 *    `ContentLength` entra. Sem `signableHeaders`, a URL aceita qualquer tipo.
 * 2. O SDK v3 atual injeta `x-amz-checksum-crc32=AAAAAA==` (o CRC32 de um corpo
 *    vazio) na pré-assinatura. O navegador sobe bytes de verdade, o bucket
 *    confere contra o checksum de nada, e o upload falha.
 */

const ENV = {
  NODE_ENV: 'development',
  MEDIA_S3_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
  MEDIA_S3_BUCKET: 'fatia-midia',
  MEDIA_S3_ACCESS_KEY_ID: 'chave-de-teste',
  MEDIA_S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
};

async function paramsDoPut(): Promise<URLSearchParams> {
  const store = S3ObjectStore.fromEnv(ENV);
  if (!store) throw new Error('store deveria existir com as cinco variáveis');
  const url = await store.presignPut('users/u1/chat/abc', 'image/jpeg', 200_000, 300);
  return new URL(url).searchParams;
}

describe('S3ObjectStore.presignPut — o que a URL assinada amarra', () => {
  it('assina o tamanho E o tipo, e não só o tamanho', async () => {
    const assinados = ((await paramsDoPut()).get('X-Amz-SignedHeaders') ?? '').split(';');

    expect(assinados).toContain('content-type');
    expect(assinados).toContain('content-length');
  });

  it('não deixa o SDK plantar o checksum de um corpo vazio na URL', async () => {
    const params = await paramsDoPut();

    const checksums = [...params.keys()].filter((k) =>
      k.toLowerCase().startsWith('x-amz-checksum'),
    );
    expect(checksums).toEqual([]);
    expect(params.get('x-amz-sdk-checksum-algorithm')).toBeNull();
  });
});
