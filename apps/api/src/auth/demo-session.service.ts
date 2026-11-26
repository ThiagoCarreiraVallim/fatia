import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { DEMO_SESSION_TTL_MS, DEMO_TOKEN_PREFIX } from '../common/demo';
import type { ProvisionedUser } from './user-provisioning.service';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A sessão "Abrir no app como Ana Exemplo" (#412). Token opaco e curto (30 min),
 * guardado só como sha256, que resolve para a conta da aluna fictícia — nunca
 * para o dono que abriu. Quem decide **onde** ele vale é o `JwtAuthGuard`: só
 * em `GET` de rota `@DemoReadable`. Aqui só se cria e se confere.
 */
@Injectable()
export class DemoSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    input: { groupId: string; userId: string; createdById: string },
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    let token = DEMO_TOKEN_PREFIX;
    for (let i = 0; i < 32; i += 1) token += BASE62[randomInt(BASE62.length)];
    const expiresAt = new Date(now.getTime() + DEMO_SESSION_TTL_MS);
    // As vencidas da mesma demo saem aqui: sem job, a tabela não cresce.
    await this.prisma.$transaction([
      this.prisma.demoSession.deleteMany({
        where: { groupId: input.groupId, expiresAt: { lte: now } },
      }),
      this.prisma.demoSession.create({
        data: { ...input, tokenHash: hashToken(token), expiresAt },
      }),
    ]);
    return { token, expiresAt };
  }

  /** A conta da aluna fictícia, se o token vale. Vencido, apagado ou de outra conta: 401. */
  async authenticate(token: string, now = new Date()): Promise<ProvisionedUser> {
    const session = await this.prisma.demoSession.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        groupId: true,
        expiresAt: true,
        user: { select: { id: true, email: true, role: true, timezone: true, demoGroupId: true } },
      },
    });
    // A conta tem de ser a aluna da própria demo: um token que apontasse para
    // conta de verdade seria o pior defeito possível, e o banco não impede.
    if (!session || session.expiresAt <= now || session.user.demoGroupId !== session.groupId) {
      throw new UnauthorizedException('Sessão de demonstração vencida');
    }
    const { id, email, role, timezone } = session.user;
    return { id, email, role, timezone };
  }
}
