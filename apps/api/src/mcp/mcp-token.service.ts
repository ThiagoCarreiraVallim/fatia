import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

const TOKEN_PREFIX = 'fatia_mcp_';

@Injectable()
export class McpTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria um token. Retorna plaintext UMA vez — armazenado apenas como hash. */
  async create(userId: string, label: string) {
    const plaintext = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const tokenHash = await argon2.hash(plaintext);
    const token = await this.prisma.mcpToken.create({
      data: { userId, label, tokenHash },
    });
    return { id: token.id, label: token.label, createdAt: token.createdAt, plaintext };
  }

  async list(userId: string) {
    return this.prisma.mcpToken.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, label: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(userId: string, id: string) {
    const token = await this.prisma.mcpToken.findUnique({ where: { id } });
    if (!token) throw new NotFoundException('Token not found');
    if (token.userId !== userId) throw new ForbiddenException();
    await this.prisma.mcpToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Valida um plaintext bearer. Como argon2 não permite lookup direto por hash,
   * percorremos os tokens ativos verificando um a um. O prefixo evita varrer
   * tudo: tokens "Fatia MCP" começam com `fatia_mcp_`.
   */
  async validate(plaintext: string): Promise<string | null> {
    if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
    const candidates = await this.prisma.mcpToken.findMany({
      where: { revokedAt: null },
      select: { id: true, userId: true, tokenHash: true },
    });
    for (const c of candidates) {
      const ok = await argon2.verify(c.tokenHash, plaintext).catch(() => false);
      if (ok) {
        // best-effort lastUsedAt
        this.prisma.mcpToken
          .update({ where: { id: c.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
        return c.userId;
      }
    }
    return null;
  }
}
