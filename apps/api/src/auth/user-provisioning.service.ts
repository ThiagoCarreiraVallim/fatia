import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { LogtoJwtPayload } from './jwt-validation.service';
import { LogtoManagementService } from './logto-management.service';

/**
 * Domínio do e-mail provisório de quem nasceu sem e-mail no token. O access
 * token do Logto não carrega `email`/`name` (só o ID token, que a API não vê),
 * então antes da Management API todo usuário caía aqui.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = '@logto.local';

export interface ProvisionedUser {
  id: string;
  email: string;
  role: Role;
  timezone: string;
}

@Injectable()
export class UserProvisioningService {
  private readonly logger = new Logger(UserProvisioningService.name);

  /**
   * `sub`s cujo perfil já foi buscado neste processo. O guard roda em toda
   * requisição: sem isto, um usuário que de fato não tem e-mail no Logto (cadastro
   * só por nome de usuário) custaria uma chamada à Management API por request.
   */
  private readonly profileLookedUp = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logto?: LogtoManagementService,
  ) {}

  async provision(payload: LogtoJwtPayload): Promise<ProvisionedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { logtoSub: payload.sub },
      select: { id: true, email: true, role: true, timezone: true },
    });
    if (existing) {
      return existing.email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)
        ? this.backfillProfile(existing, payload)
        : existing;
    }

    const profile = payload.email ? null : await this.lookUpProfile(payload.sub);
    const email = payload.email ?? profile?.email ?? `${payload.sub}${PLACEHOLDER_EMAIL_DOMAIN}`;
    const name = payload.name ?? profile?.name ?? email.split('@')[0] ?? 'User';
    const role = this.resolveRole(payload.roles);

    try {
      const created = await this.prisma.user.create({
        data: { logtoSub: payload.sub, email, name, role },
        select: { id: true, email: true, role: true, timezone: true },
      });
      this.logger.log(`Provisioned user ${created.id} (sub=${payload.sub})`);
      return created;
    } catch (erro) {
      // O primeiro acesso de alguém dispara várias requisições ao mesmo tempo (a
      // tela do chat pede cota, conversas e disponibilidade juntas), e todas
      // chegam aqui sem achar o usuário. Uma cria; as outras batem na unique.
      // Relê pelo `sub`: se foi a corrida, o usuário agora existe. Se não existe,
      // o conflito é de outra conta (mesmo e-mail), e esse erro sobe.
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') {
        throw erro;
      }
      const criadoPorOutra = await this.prisma.user.findUnique({
        where: { logtoSub: payload.sub },
        select: { id: true, email: true, role: true, timezone: true },
      });
      if (!criadoPorOutra) throw erro;
      return criadoPorOutra;
    }
  }

  /**
   * Consultas em curso, por `sub`. O primeiro acesso dispara várias requisições
   * juntas: sem isto, a que chegava durante a consulta da primeira via o `sub` já
   * marcado, criava a conta com o e-mail provisório, e o backfill também não
   * consultava mais — a conta ficava `<sub>@logto.local` até a API reiniciar.
   */
  private readonly profileLookups = new Map<
    string,
    ReturnType<LogtoManagementService['getUserProfile']>
  >();

  private lookUpProfile(sub: string): ReturnType<LogtoManagementService['getUserProfile']> {
    if (!this.logto) return Promise.resolve(null);
    const inFlight = this.profileLookups.get(sub);
    if (inFlight) return inFlight;
    if (this.profileLookedUp.has(sub)) return Promise.resolve(null);
    this.profileLookedUp.add(sub);
    const lookup = this.logto.getUserProfile(sub).finally(() => this.profileLookups.delete(sub));
    this.profileLookups.set(sub, lookup);
    return lookup;
  }

  /**
   * Conta criada antes desta correção (ou com o Logto fora do ar): troca o e-mail
   * provisório e o nome-`sub` pelo perfil real, uma vez por processo. Conflito de
   * e-mail com outra conta mantém o provisório — não é hora de decidir fusão.
   */
  private async backfillProfile(
    existing: ProvisionedUser,
    payload: LogtoJwtPayload,
  ): Promise<ProvisionedUser> {
    const profile = payload.email
      ? { email: payload.email, name: payload.name ?? null }
      : await this.lookUpProfile(payload.sub);
    if (!profile?.email) return existing;
    try {
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: { email: profile.email, ...(profile.name ? { name: profile.name } : {}) },
        select: { id: true, email: true, role: true, timezone: true },
      });
      this.logger.log(`Backfilled e-mail/nome do usuário ${existing.id} a partir do Logto`);
      return updated;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return existing;
      }
      throw erro;
    }
  }

  private resolveRole(roles: string[] | undefined): Role {
    if (!roles?.length) return Role.USER;
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    return isAdmin ? Role.ADMIN : Role.USER;
  }
}
