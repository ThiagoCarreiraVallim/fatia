import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../common/prisma.service';
import { LogtoManagementService } from './logto-management.service';

interface IdTokenClaims extends JWTPayload {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

const cleanName = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 80);
const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/**
 * O e-mail e o nome reais da pessoa, sem depender da Management API (ADR 050).
 *
 * O access token do Logto não traz `email` nem `name`; o ID token traz, mas só
 * o app o recebe. Depois do login o app manda o ID token aqui, e só vale se:
 *
 * - a assinatura confere no JWKS do Logto, o `iss` é o do Logto e o `aud` é o
 *   app mobile (`LOGTO_MOBILE_APP_ID`) — um ID token emitido para outro cliente
 *   não serve;
 * - o `sub` é o da conta autenticada pelo access token. Um ID token de outra
 *   pessoa é recusado (403) e nada é gravado.
 *
 * Com isso some o `<sub>@logto.local` de quem entrou sem M2M, e quem já está
 * assim é corrigido no próximo login (backfill).
 *
 * Também mora aqui o caminho de volta (nome editado e troca de e-mail para o
 * Logto), que precisa do `sub` e da Management API.
 */
@Injectable()
export class IdentitySyncService implements OnModuleInit {
  private readonly logger = new Logger(IdentitySyncService.name);
  private jwks!: ReturnType<typeof createRemoteJWKSet>;
  private issuer!: string;
  private audiences: string[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logto: LogtoManagementService,
  ) {}

  onModuleInit() {
    const endpoint = this.config.getOrThrow<string>('LOGTO_ENDPOINT').replace(/\/+$/, '');
    this.issuer = `${endpoint}/oidc`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/jwks`));
    this.audiences = [this.config.get<string>('LOGTO_MOBILE_APP_ID')].filter((v): v is string =>
      Boolean(v),
    );
  }

  async syncFromIdToken(userId: string, idToken: string): Promise<{ email: string; name: string }> {
    if (this.audiences.length === 0) {
      throw new ServiceUnavailableException('LOGTO_MOBILE_APP_ID não configurado');
    }
    let claims: IdTokenClaims;
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.issuer,
        audience: this.audiences,
      });
      claims = payload as IdTokenClaims;
    } catch (err) {
      this.logger.debug(`id_token recusado: ${(err as Error).message}`);
      throw new UnauthorizedException('id_token inválido');
    }

    const user = await this.findUser(userId);
    if (!claims.sub || claims.sub !== user.logtoSub) {
      throw new ForbiddenException('id_token de outra conta');
    }

    const data: { email?: string; name?: string } = {};
    if (typeof claims.email === 'string' && claims.email_verified === true) {
      const email = normalizeEmail(claims.email);
      if (email && email !== user.email) data.email = email;
    }
    if (typeof claims.name === 'string' && this.isProvisionalName(user)) {
      const name = cleanName(claims.name);
      if (name && name !== user.name) data.name = name;
    }
    if (!data.email && !data.name) return { email: user.email, name: user.name };

    try {
      return await this.update(userId, data);
    } catch (err) {
      // O e-mail já é de outra conta local: não é hora de decidir fusão. Fica o
      // que já estava, e o nome entra mesmo assim.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      this.logger.warn(`E-mail do id_token já usado por outra conta (usuário ${userId})`);
      if (!data.name) return { email: user.email, name: user.name };
      return this.update(userId, { name: data.name });
    }
  }

  /** O nome editado no app também no Logto, quando há Management API. Nunca lança. */
  async pushName(userId: string, name: string): Promise<void> {
    if (!this.logto.isConfigured()) return;
    try {
      const user = await this.findUser(userId);
      await this.logto.updateUserName(user.logtoSub, cleanName(name));
    } catch (err) {
      this.logger.warn(`Nome não enviado ao Logto: ${(err as Error).message}`);
    }
  }

  /** A troca de e-mail depende da Management API (código pelo SMTP do Logto). */
  emailChangeEnabled(): boolean {
    return this.logto.isConfigured();
  }

  /**
   * Troca de e-mail, parte 1. A senha atual é conferida antes: com um access
   * token roubado, trocar o e-mail e depois recuperar a senha tomaria a conta.
   */
  async requestEmailChange(userId: string, rawEmail: string, password: string): Promise<void> {
    this.requireManagement();
    const user = await this.findUser(userId);
    if (!(await this.logto.verifyPassword(user.logtoSub, password))) {
      throw new BadRequestException('Senha incorreta');
    }
    await this.logto.sendEmailCode(normalizeEmail(rawEmail));
  }

  /** Parte 2: o código que chegou no e-mail novo. */
  async confirmEmailChange(
    userId: string,
    rawEmail: string,
    code: string,
  ): Promise<{ email: string; name: string }> {
    this.requireManagement();
    const email = normalizeEmail(rawEmail);
    const user = await this.findUser(userId);
    if (!(await this.logto.verifyEmailCode(email, code.trim()))) {
      throw new BadRequestException('Código incorreto ou expirado');
    }
    const result = await this.logto.updatePrimaryEmail(user.logtoSub, email);
    if (result === 'in_use') throw new ConflictException('Este e-mail já tem conta');
    if (result !== 'ok') throw new ServiceUnavailableException('Logto indisponível');
    try {
      return await this.update(userId, { email });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este e-mail já tem conta');
      }
      throw err;
    }
  }

  private requireManagement() {
    if (!this.logto.isConfigured()) {
      throw new ServiceUnavailableException('Troca de e-mail indisponível neste servidor');
    }
  }

  /** Nome que ninguém escolheu: o `sub` (provisionamento sem perfil) ou vazio. */
  private isProvisionalName(user: { name: string; logtoSub: string }): boolean {
    const name = user.name.trim();
    return !name || name === user.logtoSub || name === 'User';
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, logtoSub: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async update(
    userId: string,
    data: { email?: string; name?: string },
  ): Promise<{ email: string; name: string }> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { email: true, name: true },
    });
    return { email: row.email, name: row.name };
  }
}
