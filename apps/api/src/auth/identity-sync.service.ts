import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { isProvisionalName } from '../users/provisional-name';
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
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Quanto vale um pedido de troca de e-mail (parte 1 → parte 2). */
const EMAIL_CHANGE_TTL_MS = 15 * 60_000;
/** Pedidos por hora, por pessoa e por e-mail de destino. */
const EMAIL_CHANGE_PER_HOUR = 5;

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
    // Um ID token emitido antes da troca de e-mail no app traz o e-mail velho
    // (o app guarda o token de login); não pode desfazer a troca.
    const issuedBeforeChange =
      user.emailChangedAt instanceof Date &&
      (typeof claims.iat !== 'number' || claims.iat * 1000 < user.emailChangedAt.getTime());
    if (typeof claims.email === 'string' && claims.email_verified === true && !issuedBeforeChange) {
      const email = normalizeEmail(claims.email);
      if (email && email !== user.email) data.email = email;
    }
    if (typeof claims.name === 'string' && isProvisionalName(user)) {
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
   *
   * O código do Logto é "Generic" — amarrado só ao e-mail. Por isso a senha
   * conferida vira um pedido desta conta para este e-mail (15 min, uso único),
   * e a parte 2 só vale com ele e com o nonce devolvido aqui.
   *
   * Destino que já é de outra conta (aqui ou no Logto) responde igual, sem
   * mandar código: a resposta não revela se a conta existe.
   */
  async requestEmailChange(
    userId: string,
    rawEmail: string,
    password: string,
  ): Promise<{ requestToken: string }> {
    this.requireManagement();
    const email = normalizeEmail(rawEmail);
    const user = await this.findUser(userId);
    if (!(await this.logto.verifyPassword(user.logtoSub, password))) {
      throw new BadRequestException('Senha incorreta');
    }

    const since = new Date(Date.now() - 60 * 60_000);
    const [byUser, byEmail] = await Promise.all([
      this.prisma.emailChangeRequest.count({ where: { userId, createdAt: { gte: since } } }),
      this.prisma.emailChangeRequest.count({ where: { email, createdAt: { gte: since } } }),
    ]);
    if (byUser >= EMAIL_CHANGE_PER_HOUR || byEmail >= EMAIL_CHANGE_PER_HOUR) {
      throw new HttpException('Muitos pedidos. Tente mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const nonce = randomBytes(24).toString('base64url');
    const taken = await this.emailTakenByOther(user, email);
    // Grava mesmo quando o destino está em uso: o pedido conta no limite, e
    // sem código mandado a parte 2 nunca passa.
    await this.prisma.emailChangeRequest.create({
      data: {
        userId,
        email,
        nonceHash: sha256(nonce),
        expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
        consumedAt: taken ? new Date() : null,
      },
    });
    if (!taken) await this.logto.sendEmailCode(email);
    return { requestToken: nonce };
  }

  /**
   * Parte 2: o código que chegou no e-mail novo, com o pedido da parte 1 desta
   * mesma conta. O pedido é consumido antes de tocar o Logto.
   */
  async confirmEmailChange(
    userId: string,
    rawEmail: string,
    code: string,
    requestToken: string,
  ): Promise<{ email: string; name: string }> {
    this.requireManagement();
    const email = normalizeEmail(rawEmail);
    const user = await this.findUser(userId);
    const invalid = () => new BadRequestException('Código incorreto ou expirado');

    const pending = await this.prisma.emailChangeRequest.findFirst({
      where: {
        userId,
        email,
        nonceHash: sha256(requestToken),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!pending) throw invalid();
    if (!(await this.logto.verifyEmailCode(email, code.trim()))) throw invalid();
    // Uso único, também sob corrida: só quem consome a linha segue.
    const consumed = await this.prisma.emailChangeRequest.updateMany({
      where: { id: pending.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid();

    if (await this.localEmailTaken(userId, email)) {
      throw new ConflictException('Este e-mail não pode ser usado');
    }
    const result = await this.logto.updatePrimaryEmail(user.logtoSub, email);
    if (result === 'in_use') throw new ConflictException('Este e-mail não pode ser usado');
    if (result !== 'ok') throw new ServiceUnavailableException('Logto indisponível');
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: { email, emailChangedAt: new Date() },
        select: { email: true, name: true },
      });
      return { email: row.email, name: row.name };
    } catch (err) {
      // O Logto já aceitou: volta ao e-mail antigo para os dois não divergirem.
      await this.logto
        .updatePrimaryEmail(user.logtoSub, user.email)
        .catch((e: Error) => this.logger.error(`Logto não voltou ao e-mail antigo: ${e.message}`));
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este e-mail não pode ser usado');
      }
      throw err;
    }
  }

  private async localEmailTaken(userId: string, email: string): Promise<boolean> {
    const other = await this.prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    return other !== null;
  }

  private async emailTakenByOther(
    user: { id: string; logtoSub: string },
    email: string,
  ): Promise<boolean> {
    if (await this.localEmailTaken(user.id, email)) return true;
    try {
      const owner = await this.logto.findUserIdByEmail(email);
      return owner !== null && owner !== user.logtoSub;
    } catch (err) {
      this.logger.warn(`Busca de e-mail no Logto falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Logto indisponível');
    }
  }

  private requireManagement() {
    if (!this.logto.isConfigured()) {
      throw new ServiceUnavailableException('Troca de e-mail indisponível neste servidor');
    }
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, logtoSub: true, email: true, name: true, emailChangedAt: true },
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
