import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
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

    const created = await this.prisma.user.create({
      data: { logtoSub: payload.sub, email, name, role },
      select: { id: true, email: true, role: true, timezone: true },
    });
    this.logger.log(`Provisioned user ${created.id} (sub=${payload.sub})`);
    return created;
  }

  private resolveRole(roles: string[] | undefined): Role {
    if (!roles?.length) return Role.USER;
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    return isAdmin ? Role.ADMIN : Role.USER;
  }
}
