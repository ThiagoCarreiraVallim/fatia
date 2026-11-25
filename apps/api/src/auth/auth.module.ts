import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtValidationService } from './jwt-validation.service';
import { UserProvisioningService } from './user-provisioning.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthDiscoveryController } from './oauth-discovery.controller';
import { OAuthFacadeController } from './oauth-facade.controller';
import { OAuthFacadeService } from './oauth-facade.service';
import { LogtoManagementService } from './logto-management.service';
import { IdentitySyncService } from './identity-sync.service';
import { McpConnectionRecorder } from './mcp-connection.service';
import { McpConnectionsModule } from './mcp-connections.module';
import { DemoSessionService } from './demo-session.service';

@Module({
  imports: [McpConnectionsModule],
  controllers: [OAuthDiscoveryController, OAuthFacadeController],
  providers: [
    JwtValidationService,
    UserProvisioningService,
    JwtAuthGuard,
    DemoSessionService,
    OAuthFacadeService,
    LogtoManagementService,
    IdentitySyncService,
    McpConnectionRecorder,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [
    DemoSessionService,
    JwtValidationService,
    UserProvisioningService,
    JwtAuthGuard,
    LogtoManagementService,
    IdentitySyncService,
  ],
})
export class AuthModule {}
