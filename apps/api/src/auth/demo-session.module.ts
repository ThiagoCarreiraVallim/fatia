import { Module } from '@nestjs/common';
import { DemoSessionService } from './demo-session.service';

/**
 * A sessão curta da demo (#412) num módulo só dela: o guard global (no
 * `AuthModule`) e o `SharingModule` usam o mesmo serviço sem o `SharingModule`
 * importar o `AuthModule`, que registra o `APP_GUARD`.
 */
@Module({
  providers: [DemoSessionService],
  exports: [DemoSessionService],
})
export class DemoSessionModule {}
