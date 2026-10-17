import { Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStore } from './object-store.port';

type Env = Record<string, string | undefined>;

/** O bucket S3 de verdade: Cloudflare R2 em produção, SeaweedFS no dev. */
export class S3ObjectStore implements ObjectStore {
  private readonly logger = new Logger(S3ObjectStore.name);

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  /**
   * `null` sem as cinco variáveis, ou em teste: o envio responde 503 e o resto
   * do produto segue, como o Asaas sem chave.
   */
  static fromEnv(env: Env): S3ObjectStore | null {
    if (env.NODE_ENV === 'test') return null;
    const {
      MEDIA_S3_ENDPOINT,
      MEDIA_S3_BUCKET,
      MEDIA_S3_ACCESS_KEY_ID,
      MEDIA_S3_SECRET_ACCESS_KEY,
    } = env;
    if (
      !MEDIA_S3_ENDPOINT ||
      !MEDIA_S3_BUCKET ||
      !MEDIA_S3_ACCESS_KEY_ID ||
      !MEDIA_S3_SECRET_ACCESS_KEY
    ) {
      return null;
    }
    const client = new S3Client({
      endpoint: MEDIA_S3_ENDPOINT,
      region: env.MEDIA_S3_REGION || 'auto',
      // R2 e SeaweedFS aceitam caminho; subdomínio por bucket exigiria DNS no dev.
      forcePathStyle: true,
      credentials: {
        accessKeyId: MEDIA_S3_ACCESS_KEY_ID,
        secretAccessKey: MEDIA_S3_SECRET_ACCESS_KEY,
      },
    });
    return new S3ObjectStore(client, MEDIA_S3_BUCKET);
  }

  presignPut(key: string, mime: string, bytes: number, expiresInSec: number): Promise<string> {
    // Tipo e tamanho entram na assinatura: corpo de outro tamanho é recusado
    // pelo storage, antes de a API ver qualquer coisa.
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: bytes,
      }),
      { expiresIn: expiresInSec },
    );
  }

  presignGet(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSec,
    });
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: r.ContentLength ?? 0, mime: r.ContentType ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async get(key: string): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!r.Body) throw new Error(`Objeto ${key} sem corpo`);
    return Buffer.from(await r.Body.transformToByteArray());
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }),
    );
  }

  async delete(keys: string[]): Promise<void> {
    // O DeleteObjects aceita até mil chaves por chamada.
    for (let i = 0; i < keys.length; i += 1000) {
      const lote = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  /**
   * Só no desenvolvimento: cria o bucket e libera o CORS para a web local
   * enviar direto. Em produção, bucket e CORS são configuração do R2
   * (`docs/OPERATIONS.md`), e a chave da API não precisa poder criar bucket.
   */
  async ensureDevBucket(webOrigin: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket de mídia ${this.bucket} criado`);
    }
    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [webOrigin],
              AllowedMethods: ['PUT', 'GET'],
              AllowedHeaders: ['*'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.name === 'NoSuchBucket' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
