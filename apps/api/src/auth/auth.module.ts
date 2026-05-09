import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtValidationService } from './jwt-validation.service';
import { UserProvisioningService } from './user-provisioning.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthDiscoveryController } from './oauth-discovery.controller';

@Module({
  controllers: [OAuthDiscoveryController],
  providers: [
    JwtValidationService,
    UserProvisioningService,
    JwtAuthGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [JwtValidationService, UserProvisioningService, JwtAuthGuard],
})
export class AuthModule {}
