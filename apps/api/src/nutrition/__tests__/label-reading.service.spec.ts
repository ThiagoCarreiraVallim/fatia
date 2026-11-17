import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { LabelReadingService } from '../label-reading.service';
import {
  AiAccessService,
  AiPlanRequiredException,
  type AiEntitlement,
} from '../../ai/ai-access.service';
import type { AiUsageService } from '../../ai/ai-usage.service';
import type { AgentLabel } from '../../ai/agent.adapter';
import { HostedAiService } from '../../ai/hosted-ai.service';
import { FakeAgentAdapter } from '../../ai/__tests__/fake-agent.adapter';
import { removerMetadadosDoJpeg } from '../helpers/strip-exif';
import { JPEG_COM_EXIF_GPS } from '../helpers/jpeg-com-exif.fixture';
import type { AiConsentService } from '../../chat/consent/ai-consent.service';

/** A pessoa já aceitou a IA: o portão do aceite tem teste próprio (`hosted-ai.service.spec`). */
const COM_ACEITE = { assertChatConsent: async () => undefined } as unknown as AiConsentService;

/**
 * Leitura do rótulo (#375, #333): foto da tabela nutricional → valores para a
 * pessoa conferir. **Não grava nada**: nem alimento, nem a foto (ADR 038, item
 * 4). O portão e o livro-caixa são do `HostedAiService`; aqui fica o que é desta
 * classe: a foto sai sem EXIF, foto recusada não gasta inferência, e o que o
 * modelo devolve é saneado antes de virar formulário.
 */

const USER = 'user-a';

const PRO: AiEntitlement = {
  tier: 'PRO',
  source: 'INSTANCE',
  motivo: 'ativa',
  degraded: false,
  subscription: null,
};
const FREE: AiEntitlement = {
  tier: 'FREE',
  source: null,
  motivo: 'sem_assinatura',
  degraded: false,
  subscription: null,
};

function label(partial: Partial<AgentLabel> = {}): AgentLabel {
  return {
    name: 'Iogurte natural integral',
    per: '100g',
    serving_grams: 170,
    kcal: 51,
    protein_g: 4.1,
    carbs_g: 5.3,
    fat_g: 3,
    fiber_g: 0,
    sodium_mg: 60,
    note: null,
    ...partial,
  };
}

function build(entitlement: AiEntitlement = PRO) {
  const agent = new FakeAgentAdapter();
  const usage = {
    assertDentroDaCota: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
  };
  const access = new AiAccessService(
    { aiTierForUser: async () => entitlement, exigePlano: () => true },
    usage as unknown as AiUsageService,
  );
  const hosted = new HostedAiService(access, usage as unknown as AiUsageService, agent, COM_ACEITE);
  return { service: new LabelReadingService(hosted), agent, usage };
}

describe('LabelReadingService', () => {
  it('manda a foto sem EXIF ao agente e devolve os valores para conferir', async () => {
    const { service, agent } = build();
    agent.readLabel.mockResolvedValueOnce({ label: label(), usage: null });

    const reading = await service.read(USER, JPEG_COM_EXIF_GPS);

    const sent = agent.readLabel.mock.calls[0][0];
    expect(sent.equals(removerMetadadosDoJpeg(JPEG_COM_EXIF_GPS))).toBe(true);
    expect(sent.length).toBeLessThan(JPEG_COM_EXIF_GPS.length);
    expect(reading).toEqual({
      name: 'Iogurte natural integral',
      basis: '100g',
      servingGrams: 170,
      kcal: 51,
      proteinG: 4.1,
      carbsG: 5.3,
      fatG: 3,
      fiberG: 0,
      sodiumMg: 60,
      note: null,
    });
  });

  it('Free: 402, sem agente', async () => {
    const { service, agent } = build(FREE);

    await expect(service.read(USER, JPEG_COM_EXIF_GPS)).rejects.toBeInstanceOf(
      AiPlanRequiredException,
    );
    expect(agent.readLabel).not.toHaveBeenCalled();
  });

  it('foto vazia, grande demais ou que não é JPEG não gasta inferência', async () => {
    const { service, agent } = build();

    await expect(service.read(USER, Buffer.alloc(0))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.read(USER, Buffer.alloc(4 * 1024 * 1024 + 1, 1))).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    await expect(service.read(USER, Buffer.from('não é jpeg'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(agent.readLabel).not.toHaveBeenCalled();
  });

  it('número impossível vira campo em branco, nunca zero nem NaN', async () => {
    const { service, agent } = build();
    agent.readLabel.mockResolvedValueOnce({
      label: label({
        kcal: Number.NaN,
        protein_g: -2,
        carbs_g: Number.POSITIVE_INFINITY,
        fat_g: null,
        sodium_mg: 5_000_000,
      }),
      usage: null,
    });

    const reading = await service.read(USER, JPEG_COM_EXIF_GPS);

    expect(reading).toMatchObject({
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      sodiumMg: null,
    });
  });

  it('porção zero some: os valores por porção ficam sem base e a tela pede a porção', async () => {
    const { service, agent } = build();
    agent.readLabel.mockResolvedValueOnce({
      label: label({ per: 'serving', serving_grams: 0 }),
      usage: null,
    });

    const reading = await service.read(USER, JPEG_COM_EXIF_GPS);

    expect(reading.basis).toBe('serving');
    expect(reading.servingGrams).toBeNull();
  });

  it('nome longo é cortado no limite do alimento (160)', async () => {
    const { service, agent } = build();
    agent.readLabel.mockResolvedValueOnce({ label: label({ name: 'x'.repeat(300) }), usage: null });

    const reading = await service.read(USER, JPEG_COM_EXIF_GPS);

    expect(reading.name).toHaveLength(160);
  });
});
