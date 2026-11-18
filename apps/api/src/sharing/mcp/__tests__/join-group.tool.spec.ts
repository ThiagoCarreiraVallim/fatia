import { HttpException, HttpStatus } from '@nestjs/common';
import type { McpToolContext } from '../../../common/decorators/tool.decorator';
import type { MembershipService } from '../../membership.service';
import { JOIN_GROUP_MAX_PER_WINDOW, JoinGroupTool } from '../join-group.tool';

/**
 * `join_group` tem teto próprio (#393, revisão I1): o throttle do `/mcp` é de
 * tráfego geral, e um agente em laço testaria códigos de entrada sem limite —
 * o código viraria oráculo de existência de academia.
 */
describe('join_group: teto por usuário', () => {
  const ctx = (userId: string) => ({ userId }) as McpToolContext;

  it(`aceita ${JOIN_GROUP_MAX_PER_WINDOW} tentativas na janela; a seguinte é 429 sem tentar entrar`, async () => {
    const requestJoin = jest.fn().mockResolvedValue({ groupId: 'g1' });
    const tool = new JoinGroupTool({ requestJoin } as unknown as MembershipService);
    for (let i = 0; i < JOIN_GROUP_MAX_PER_WINDOW; i++) {
      await tool.execute({ slug: `CODE${i}` }, ctx('u1'));
    }
    const erro = await tool.execute({ slug: 'MAIS' }, ctx('u1')).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(HttpException);
    expect((erro as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(requestJoin).toHaveBeenCalledTimes(JOIN_GROUP_MAX_PER_WINDOW);

    // Outro usuário não herda o teto.
    await expect(tool.execute({ slug: 'X' }, ctx('u2'))).resolves.toEqual({ groupId: 'g1' });
  });

  it('a tentativa que falhou (código errado) também conta', async () => {
    const requestJoin = jest.fn().mockRejectedValue(new Error('404'));
    const tool = new JoinGroupTool({ requestJoin } as unknown as MembershipService);
    for (let i = 0; i < JOIN_GROUP_MAX_PER_WINDOW; i++) {
      await tool.execute({ slug: `CODE${i}` }, ctx('u1')).catch(() => undefined);
    }
    const erro = await tool.execute({ slug: 'MAIS' }, ctx('u1')).catch((e: unknown) => e);
    expect((erro as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('a janela anda: passado o tempo, volta a aceitar', async () => {
    let agora = 1_000_000;
    const requestJoin = jest.fn().mockResolvedValue({ groupId: 'g1' });
    const tool = new JoinGroupTool({ requestJoin } as unknown as MembershipService);
    tool.clock = () => agora;
    for (let i = 0; i < JOIN_GROUP_MAX_PER_WINDOW; i++)
      await tool.execute({ slug: 'A' }, ctx('u1'));
    await expect(tool.execute({ slug: 'A' }, ctx('u1'))).rejects.toBeInstanceOf(HttpException);
    agora += 10 * 60_000 + 1;
    await expect(tool.execute({ slug: 'A' }, ctx('u1'))).resolves.toEqual({ groupId: 'g1' });
  });
});
