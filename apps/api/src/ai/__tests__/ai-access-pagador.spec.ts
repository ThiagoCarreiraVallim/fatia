import { INSTANCIA_LIBERADA, type AiEntitlement } from '../../billing/ai-entitlement';
import { AiAccessService } from '../ai-access.service';

/** Quem paga cada chamada à IA hospedada (ADR 024 e 025). */
const direito = (parcial: Partial<AiEntitlement>): AiEntitlement => ({
  tier: 'PRO',
  source: 'ASAAS',
  motivo: 'ativa',
  degraded: false,
  subscription: null,
  ...parcial,
});

describe('AiAccessService.pagoPor', () => {
  it('instância liberada paga a instância', () => {
    expect(AiAccessService.pagoPor(INSTANCIA_LIBERADA)).toEqual({
      paidBy: 'INSTANCE',
      groupId: null,
    });
  });

  it('PRO próprio paga a pessoa', () => {
    expect(AiAccessService.pagoPor(direito({}))).toEqual({ paidBy: 'USER', groupId: null });
  });

  it('assento paga a comunidade, com o id dela', () => {
    expect(
      AiAccessService.pagoPor(
        direito({
          source: 'GROUP',
          subscription: {
            id: 'pool',
            source: 'GROUP',
            status: 'ACTIVE',
            interval: 'MONTHLY',
            currentPeriodEnd: null,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            createdAt: new Date(),
            group: { id: 'g1', name: 'Academia X' },
          },
        }),
      ),
    ).toEqual({ paidBy: 'GROUP', groupId: 'g1' });
  });

  it('Free não é cobrado de ninguém', () => {
    expect(AiAccessService.pagoPor(direito({ tier: 'FREE', source: null }))).toEqual({
      paidBy: 'FREE',
      groupId: null,
    });
  });
});
