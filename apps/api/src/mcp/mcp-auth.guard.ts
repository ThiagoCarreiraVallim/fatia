import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { McpTokenService } from './mcp-token.service';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: McpTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer');
    const plaintext = auth.slice('Bearer '.length).trim();

    const userId = await this.tokens.validate(plaintext);
    if (!userId) throw new UnauthorizedException('Invalid MCP token');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, timezone: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    (req as Request & { user: CurrentUserPayload }).user = user;
    return true;
  }
}
