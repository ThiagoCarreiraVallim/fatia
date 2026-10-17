import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { LogtoJwtPayload } from './jwt-validation.service';

export interface ProvisionedUser {
  id: string;
  email: string;
  role: Role;
  timezone: string;
}

@Injectable()
export class UserProvisioningService {
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provision(payload: LogtoJwtPayload): Promise<ProvisionedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { logtoSub: payload.sub },
      select: { id: true, email: true, role: true, timezone: true },
    });
    if (existing) return existing;

    const email = payload.email ?? `${payload.sub}@logto.local`;
    const name = payload.name ?? email.split('@')[0] ?? 'User';
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

  private resolveRole(roles: string[] | undefined): Role {
    if (!roles?.length) return Role.USER;
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    return isAdmin ? Role.ADMIN : Role.USER;
  }
}
