import { INSTANCIA_LIBERADA, type AiEntitlement } from '../ai-access.service';
import { proStatusOf } from '../pro-status';
import { GetMeTool } from '../../mcp/tools/meta/get-me.tool';

const base = {
  id: 's1',
  status: 'ACTIVE' as const,
  interval: 'MONTHLY' as const,
  currentPeriodEnd: new Date('2026-12-10T03:00:00Z'),
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date('2026-10-01T12:00:00Z'),
};
const pro = (subscription: AiEntitlement['subscription'], motivo = 'ativa'): AiEntitlement =>
  ({
    tier: 'PRO',
    source: subscription?.source ?? null,
    motivo,
    degraded: false,
    subscription,
  }) as AiEntitlement;

/**
 * O estado do PRO para a própria pessoa (#403): de onde vem (dela, da
 * comunidade, de um programa) e até quando — no `get_me`. Sem fatura, preço
 * nem atraso da academia: a pessoa nunca vê a cobrança da comunidade.
 */
describe('proStatusOf (#403)', () => {
  it('programa: nome, comunidade e o fim do programa', () => {
    const s = proStatusOf(
      pro({
        ...base,
        source: 'GROUP',
        group: { id: 'g1', name: 'Academia Centro' },
        paidBy: 'PROGRAM',
        programName: 'Verão 21',
        programEndsAt: new Date('2026-11-30T03:00:00Z'),
      }),
    );
    expect(s).toEqual({
      tier: 'PRO',
      origin: 'PROGRAM',
      community: 'Academia Centro',
      program: 'Verão 21',
      until: '2026-11-30T03:00:00.000Z',
    });
  });

  it('assento da comunidade: sem data (a renovação é da academia), nem na carência', () => {
    const s = proStatusOf(
      pro(
        {
          ...base,
          source: 'GROUP',
          status: 'PAST_DUE',
          graceEndsAt: new Date('2026-11-17T03:00:00Z'),
          group: { id: 'g1', name: 'Academia Centro' },
          paidBy: 'SEAT',
          programName: null,
        },
        'carencia',
      ),
    );
    expect(s).toEqual({
      tier: 'PRO',
      origin: 'COMMUNITY',
      community: 'Academia Centro',
      program: null,
      until: null,
    });
    expect(JSON.stringify(s)).not.toMatch(/PAST_DUE|carencia|grace/i);
  });

  it('PRO da pessoa: até quando só se não renova (cancelado ou teste)', () => {
    expect(proStatusOf(pro({ ...base, source: 'ASAAS' }))).toMatchObject({
      origin: 'PERSONAL',
      until: null,
    });
    expect(proStatusOf(pro({ ...base, source: 'ASAAS', cancelAtPeriodEnd: true })).until).toBe(
      '2026-12-10T03:00:00.000Z',
    );
    expect(
      proStatusOf(
        pro(
          {
            ...base,
            source: 'APPLE',
            status: 'TRIALING',
            trialEndsAt: new Date('2026-11-27T03:00:00Z'),
          },
          'teste',
        ),
      ).until,
    ).toBe('2026-11-27T03:00:00.000Z');
  });

  it('Free e instância liberada', () => {
    expect(
      proStatusOf({
        tier: 'FREE',
        source: null,
        motivo: 'sem_assinatura',
        degraded: true,
        subscription: null,
      } as unknown as AiEntitlement),
    ).toEqual({ tier: 'FREE', origin: null, community: null, program: null, until: null });
    expect(proStatusOf(INSTANCIA_LIBERADA)).toMatchObject({ tier: 'PRO', origin: 'INSTANCE' });
  });
});

describe('get_me leva o estado do PRO (#403)', () => {
  it('junta o perfil e o estado do PRO', async () => {
    const profile = { getMe: jest.fn().mockResolvedValue({ id: 'u1', name: 'Pessoa' }) };
    const access = {
      proStatus: jest.fn().mockResolvedValue({
        tier: 'PRO',
        origin: 'PROGRAM',
        community: 'Academia',
        program: 'Verão 21',
        until: '2026-11-30T03:00:00.000Z',
      }),
    };
    const tool = new GetMeTool(profile as never, access as never);
    const r = await tool.execute({}, { userId: 'u1' } as never);
    expect(access.proStatus).toHaveBeenCalledWith('u1');
    expect(r).toMatchObject({ id: 'u1', pro: { origin: 'PROGRAM', program: 'Verão 21' } });
  });
});
