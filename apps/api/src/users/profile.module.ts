import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { ProfileService } from './profile.service';

/**
 * O perfil em módulo próprio: o `UsersModule` (REST) e o `McpModule`
 * (`get_me`/`update_me`) usam o mesmo service, e o `UsersModule` já depende do
 * chat, que depende do MCP — importar um no outro fecharia o ciclo.
 */
@Module({
  imports: [CommonModule, StorageModule],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
