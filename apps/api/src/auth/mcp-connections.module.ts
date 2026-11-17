import { Module } from '@nestjs/common';
import { McpConnectionService } from './mcp-connection.service';

/**
 * As conexões de apps de IA (#388), sem o resto da autenticação: o `McpModule`
 * importa só isto para marcar o último acesso, sem trazer o guard global e o
 * JWKS do `AuthModule` para quem monta o `/mcp` em teste.
 */
@Module({
  providers: [McpConnectionService],
  exports: [McpConnectionService],
})
export class McpConnectionsModule {}
