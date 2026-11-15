import { describe, expect, it } from 'vitest';
import {
  AI_GENERATE_DRAFT_NOTE,
  aiGenerateLabel,
  personalNoticeView,
  SHARE_TARGETS,
  shareIdentityOptions,
} from '../plan-components-copy';

describe('aviso "recebido do seu personal" (prancha 1.6)', () => {
  it('treino e plano alimentar: quem mandou, quando, e "Ver"', () => {
    expect(
      personalNoticeView({
        kind: 'workout',
        planName: 'Hipertrofia A/B',
        from: 'Helena',
        when: 'agora',
      }),
    ).toEqual({
      title: 'Novo treino: Hipertrofia A/B',
      detail: 'Helena · agora',
      action: 'Ver',
      lead: { avatar: 'Helena' },
      tone: 'neutral',
    });
    expect(
      personalNoticeView({ kind: 'nutrition-plan', kcal: 1800, from: 'Helena', when: '2 h' }).title,
    ).toBe('Plano alimentar · 1.800 kcal');
  });

  it('avaliação pedida é atenção, e check-in diz o tamanho', () => {
    const a = personalNoticeView({ kind: 'assessment', due: 'sexta' });
    expect(a).toMatchObject({
      title: 'Avaliação pedida',
      detail: 'Até sexta',
      action: 'Registrar',
    });
    expect(a.tone).toBe('attention');
    expect(a.lead).toEqual({ icon: 'ruler' });
    expect(personalNoticeView({ kind: 'checkin', questions: 5, minutes: 1 })).toMatchObject({
      title: 'Check-in semanal',
      detail: '5 perguntas · 1 min',
      action: 'Responder',
    });
  });
});

describe('folha "Compartilhar" (prancha 1.5)', () => {
  it('aparecer como: nome de exibição, @ ou ninguém', () => {
    expect(shareIdentityOptions({ name: 'Ana', handle: 'anademo' })).toEqual([
      { as: 'name', label: 'Ana', value: 'Ana' },
      { as: 'handle', label: '@anademo', value: 'anademo' },
      { as: 'none', label: 'Ninguém' },
    ]);
  });

  it('sem @, só nome ou ninguém', () => {
    expect(shareIdentityOptions({ name: 'Ana', handle: null }).map((o) => o.as)).toEqual([
      'name',
      'none',
    ]);
  });

  it('destinos: Stories, WhatsApp e Salvar', () => {
    expect(SHARE_TARGETS.map((t) => t.label)).toEqual(['Stories', 'WhatsApp', 'Salvar']);
  });
});

describe('"Gerar com IA" (prancha 1.7)', () => {
  it('o botão diz o que está acontecendo', () => {
    expect(aiGenerateLabel('idle')).toBe('Gerar com IA');
    expect(aiGenerateLabel('generating')).toBe('Gerando…');
    expect(aiGenerateLabel('draft')).toBe('Gerar de novo');
  });

  it('o resultado é rascunho, nunca publicado direto', () => {
    expect(AI_GENERATE_DRAFT_NOTE).toMatch(/rascunho/i);
  });
});

describe('peças compartilhadas pelos componentes do app e da web', () => {
  it('selos de plano e de estado', async () => {
    const { STATUS_BADGE_LABELS } = await import('../plan-components-copy');
    expect(STATUS_BADGE_LABELS.trial(1)).toBe('Teste · 1 dia');
    expect(STATUS_BADGE_LABELS['pro-community']('Academia')).toBe('PRO · Academia');
    expect([
      STATUS_BADGE_LABELS.done,
      STATUS_BADGE_LABELS.pending,
      STATUS_BADGE_LABELS.risk,
    ]).toEqual(['Concluído', 'Pendente', 'Em risco']);
  });

  it('linha com swipe: passou da metade abre, senão fecha', async () => {
    const { swipeSettle } = await import('../plan-components-copy');
    expect(swipeSettle(-100, 176)).toBe(-176);
    expect(swipeSettle(-80, 176)).toBe(0);
  });

  it('régua: o traço maior anda com o valor', async () => {
    const { rulerMajorTick } = await import('../plan-components-copy');
    expect(rulerMajorTick(0, { value: 30, min: 30, step: 1 })).toBe(true);
    expect(rulerMajorTick(0, { value: 31, min: 30, step: 1 })).toBe(false);
    expect(rulerMajorTick(4, { value: 31, min: 30, step: 1 })).toBe(true);
  });

  it('cartão: como a pessoa aparece', async () => {
    const { shareIdentityText } = await import('../plan-components-copy');
    expect(shareIdentityText({ as: 'name', value: 'Ana' })).toBe('Ana');
    expect(shareIdentityText({ as: 'handle', value: 'ana' })).toBe('@ana');
    expect(shareIdentityText({ as: 'none' })).toBeNull();
  });
});
