import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';

export interface LogtoJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
  scope?: string;
}

@Injectable()
export class JwtValidationService implements OnModuleInit {
  private readonly logger = new Logger(JwtValidationService.name);
  private jwks!: ReturnType<typeof createRemoteJWKSet>;
  private issuer!: string;
  private audience!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.getOrThrow<string>('LOGTO_ENDPOINT').replace(/\/+$/, '');
    this.audience = this.config.getOrThrow<string>('LOGTO_AUDIENCE');
    this.issuer = `${endpoint}/oidc`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/jwks`));
    this.logger.log(`JWKS loaded from ${this.issuer}/jwks`);
  }

  async verify(token: string): Promise<LogtoJwtPayload> {
    let result: JWTVerifyResult;
    try {
      result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid token');
    }

    const payload = result.payload as LogtoJwtPayload;
    if (!payload.sub) throw new UnauthorizedException('Token missing sub');
    return payload;
  }
}
