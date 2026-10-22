import { Logger, Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { OBJECT_STORE } from './object-store.port';
import { S3ObjectStore } from './s3-object-store';

/**
 * Mídia publicada (ADR 028). Sem as variáveis `MEDIA_S3_*` o bucket não nasce e
 * o envio responde 503; o resto do produto não muda.
 */
@Module({
  imports: [CommonModule],
  controllers: [MediaController],
  providers: [
    {
      provide: OBJECT_STORE,
      useFactory: async () => {
        const store = S3ObjectStore.fromEnv(process.env);
        if (store && process.env.NODE_ENV === 'development') {
          await store
            .ensureDevBucket(process.env.WEB_ORIGIN || 'http://localhost:3030')
            .catch((err: unknown) =>
              new Logger('StorageModule').warn(
                `Bucket de mídia do dev indisponível: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
        return store;
      },
    },
    MediaService,
  ],
  exports: [MediaService],
})
export class StorageModule {}
