import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ShareScope } from '@fatia/db';
import { MembershipService } from '../membership.service';
import { groupConsentSchema } from './consent-input';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

/** Tentativas de `join_group` por usuário numa janela de 10 minutos (#393). */
export const JOIN_GROUP_MAX_PER_WINDOW = 10;
const JOIN_GROUP_WINDOW_MS = 10 * 60_000;

@Injectable()
@McpTool()
export class JoinGroupTool implements McpToolDef {
  constructor(private readonly memberships: MembershipService) {}
  /** Relógio trocável nos testes. */
  clock: () => number = () => Date.now();
  /**
   * Teto próprio, por usuário: o throttle do `/mcp` é de tráfego geral, e um
   * agente em laço testaria códigos de entrada sem limite (oráculo de academia).
   * Em memória, por instância: basta para tirar o laço do alcance. Conta toda
   * tentativa, inclusive a de código errado.
   */
  private readonly tentativas = new Map<string, number[]>();

  private assertRoom(userId: string): void {
    const agora = this.clock();
    const janela = (this.tentativas.get(userId) ?? []).filter(
      (t) => t > agora - JOIN_GROUP_WINDOW_MS,
    );
    if (janela.length >= JOIN_GROUP_MAX_PER_WINDOW) {
      this.tentativas.set(userId, janela);
      throw new HttpException(
        'Muitas tentativas de entrar com código. Espere alguns minutos e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    janela.push(agora);
    this.tentativas.set(userId, janela);
  }
  readonly name = 'join_group';
  readonly title = 'Pedir para entrar num grupo';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly appOnly = { screen: 'Comunidades', path: '/community' };
  readonly description =
    'Pede para entrar numa academia ou comunidade pelo código público (slug). Conforme a ' +
    'comunidade, a entrada é imediata ou fica aguardando a aprovação do dono; quem entra é ' +
    'sempre o próprio usuário — não é possível colocar outra pessoa num grupo. Por padrão ' +
    'nada é compartilhado: `scopes` e `statsOptIn` só devem ser enviados depois de perguntar ' +
    'ao usuário, categoria por categoria. ' +
    'Exemplo: {"slug":"academia-central-9f3a2b71","scopes":["WORKOUT"],"statsOptIn":false}';
  readonly inputSchema = {
    slug: z.string().describe('Código público da comunidade, como aparece no convite'),
    scopes: groupConsentSchema.scopes.optional(),
    statsOptIn: groupConsentSchema.statsOptIn.optional(),
  } as const;
  async execute(
    { slug, scopes, statsOptIn }: { slug: string; scopes?: ShareScope[]; statsOptIn?: boolean },
    { userId }: McpToolContext,
  ) {
    this.assertRoom(userId);
    return this.memberships.requestJoin(userId, slug, {
      scopes: scopes ?? [],
      statsOptIn: statsOptIn ?? false,
    });
  }
}
