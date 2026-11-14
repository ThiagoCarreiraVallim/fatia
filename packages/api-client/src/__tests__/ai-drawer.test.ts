import { describe, expect, it } from 'vitest';
import {
  AI_DRAWER_MANUAL_ITEMS,
  AI_PRO_TEASER,
  aiDrawerManualItems,
  aiFabLabel,
  aiFabState,
  completionsFor,
  conversationTimeLabel,
  drawerConversations,
  freeOfferCta,
  mealTypeForTime,
  pendingCardMode,
  workoutQuickLabel,
} from '../ai-drawer';
import type { ChatActionPreview, ChatConversationSummary, ChatInterruptValue } from '../chat';

const hora = (h: number, m = 0) => new Date(2026, 9, 14, h, m);

const conversa = (
  id: string,
  state: ChatConversationSummary['state'],
  updatedAt: string,
): ChatConversationSummary => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  state,
});

describe('mealTypeForTime', () => {
  it('sugere a refeição pela hora local', () => {
    expect(mealTypeForTime(hora(7))).toBe('BREAKFAST');
    expect(mealTypeForTime(hora(10, 29))).toBe('BREAKFAST');
    expect(mealTypeForTime(hora(10, 30))).toBe('LUNCH');
    expect(mealTypeForTime(hora(14, 59))).toBe('LUNCH');
    expect(mealTypeForTime(hora(15))).toBe('SNACK');
    expect(mealTypeForTime(hora(18))).toBe('DINNER');
    expect(mealTypeForTime(hora(23, 59))).toBe('DINNER');
  });

  it('madrugada é lanche, não café da manhã', () => {
    expect(mealTypeForTime(hora(0))).toBe('SNACK');
    expect(mealTypeForTime(hora(4, 59))).toBe('SNACK');
    expect(mealTypeForTime(hora(5))).toBe('BREAKFAST');
  });
});

describe('registro manual do menu da IA', () => {
  it('lista os cinco registros na ordem do canvas, sem Hábito e Check-in até a #390', () => {
    expect(AI_DRAWER_MANUAL_ITEMS.map((i) => i.label)).toEqual([
      'Refeição',
      'Água',
      'Peso',
      'Passos',
      'Treino',
    ]);
    expect(AI_DRAWER_MANUAL_ITEMS.map((i) => i.key)).not.toContain('habit');
    expect(AI_DRAWER_MANUAL_ITEMS.map((i) => i.key)).not.toContain('checkin');
  });

  it('com o flag ligado (a #390), Hábito e Check-in entram no fim', () => {
    expect(aiDrawerManualItems({ habits: true }).map((i) => i.key)).toEqual([
      'meal',
      'water',
      'weight',
      'steps',
      'workout',
      'habit',
      'checkin',
    ]);
  });

  it('cada item tem ícone do design system', () => {
    expect(AI_DRAWER_MANUAL_ITEMS.map((i) => i.icon)).toEqual([
      'apple',
      'drop',
      'scale',
      'steps',
      'dumbbell',
    ]);
  });
});

describe('workoutQuickLabel', () => {
  it('retoma a sessão aberta em vez de começar outra', () => {
    expect(workoutQuickLabel(true)).toBe('Continuar treino');
    expect(workoutQuickLabel(false)).toBe('Começar treino livre');
  });
});

describe('bloco Free', () => {
  it('mostra o que a IA Pro faz e leva ao chat bloqueado', () => {
    expect(AI_PRO_TEASER.title).toBe('Com a IA Pro');
    expect(AI_PRO_TEASER.items).toEqual([
      'Foto do prato vira registro',
      'Quanto falta de proteína?',
      'Trocar exercício com dor',
    ]);
    expect(AI_PRO_TEASER.href).toBe('/plan?recurso=chat');
  });

  it('com compra no app oferece o PRO; sem (iOS), o código da comunidade', () => {
    expect(freeOfferCta(true)).toEqual({ label: 'Ver o PRO', href: '/plan' });
    expect(freeOfferCta(false)).toEqual({ label: 'Código da comunidade', href: '/community' });
  });
});

describe('estado do botão da IA', () => {
  it('o selo conta só as conversas esperando; o anel liga com alguma pensando', () => {
    const state = aiFabState([
      conversa('a', 'waiting', '2026-11-14T10:00:00Z'),
      conversa('b', 'thinking', '2026-11-14T10:00:00Z'),
      conversa('c', 'waiting', '2026-11-14T10:00:00Z'),
      conversa('d', 'idle', '2026-11-14T10:00:00Z'),
    ]);
    expect(state).toEqual({ thinking: true, waiting: 2 });
    expect(aiFabState([conversa('d', 'idle', '2026-11-14T10:00:00Z')])).toEqual({
      thinking: false,
      waiting: 0,
    });
    expect(aiFabState(undefined)).toEqual({ thinking: false, waiting: 0 });
  });

  it('o nome acessível diz o estado', () => {
    expect(aiFabLabel({ thinking: false, waiting: 0 })).toBe('Abrir a IA');
    expect(aiFabLabel({ thinking: true, waiting: 0 })).toBe('IA trabalhando · abrir');
    expect(aiFabLabel({ thinking: true, waiting: 1 })).toBe('IA · 1 esperando você');
    expect(aiFabLabel({ thinking: false, waiting: 3 })).toBe('IA · 3 esperando você');
    expect(aiFabLabel({ thinking: false, waiting: 0 }, { locked: true })).toBe(
      'Abrir registro (IA no Pro)',
    );
  });
});

describe('conversas no menu da IA', () => {
  it('em andamento no topo (esperando, depois pensando) e depois as recentes', () => {
    const lista = drawerConversations(
      [
        conversa('recente', 'idle', '2026-11-14T15:00:00Z'),
        conversa('pensando', 'thinking', '2026-11-14T09:00:00Z'),
        conversa('velha', 'idle', '2026-11-10T15:00:00Z'),
        conversa('esperando', 'waiting', '2026-11-13T09:00:00Z'),
      ],
      3,
    );
    expect(lista.map((c) => c.id)).toEqual(['esperando', 'pensando', 'recente']);
  });

  it('a hora da conversa: estado, "hoje, 12:41", "ontem" ou a data', () => {
    const now = new Date(2026, 10, 14, 18, 0);
    expect(conversationTimeLabel(conversa('a', 'waiting', now.toISOString()), now)).toBe(
      'esperando você',
    );
    expect(conversationTimeLabel(conversa('a', 'thinking', now.toISOString()), now)).toBe(
      'pensando…',
    );
    expect(
      conversationTimeLabel(
        conversa('a', 'idle', new Date(2026, 10, 14, 12, 41).toISOString()),
        now,
      ),
    ).toBe('hoje, 12:41');
    expect(
      conversationTimeLabel(
        conversa('a', 'idle', new Date(2026, 10, 13, 22, 0).toISOString()),
        now,
      ),
    ).toBe('ontem');
    expect(
      conversationTimeLabel(conversa('a', 'idle', new Date(2026, 10, 2, 9, 0).toISOString()), now),
    ).toBe('2 de nov.');
  });
});

describe('completar com o teclado aberto', () => {
  it('sem texto não completa nada; com texto, frases locais que começam igual', () => {
    expect(completionsFor('')).toEqual([]);
    expect(completionsFor('  ')).toEqual([]);
    const comi = completionsFor('comi');
    expect(comi.length).toBeGreaterThan(0);
    expect(comi.every((f) => f.toLowerCase().startsWith('comi'))).toBe(true);
    expect(completionsFor('COMI')).toEqual(comi);
    expect(completionsFor('xyzw')).toEqual([]);
  });

  it('no máximo três frases', () => {
    expect(completionsFor('t').length).toBeLessThanOrEqual(3);
  });
});

describe('cartão "esperando você"', () => {
  const confirma = (n: number): ChatInterruptValue => ({
    kind: 'confirm',
    prompt: 'Confere?',
    actions: Array.from({ length: n }, (_, i) => ({
      kind: 'confirm' as const,
      toolCallId: `t${i}`,
      tool: 'log_meal',
      title: 'Registrar refeição',
      prompt: 'Registrar?',
      arguments: {},
    })),
  });

  const previa = (n: number, valida = true): ChatActionPreview =>
    valida
      ? { valida: true, linhas: Array.from({ length: n }, () => ({ rotulo: 'a', valor: 'b' })) }
      : { valida: false, linhas: [], problema: 'x' };

  it('uma escrita com a prévia inteira: "Gravar assim"', () => {
    expect(pendingCardMode(confirma(1), previa(4))).toBe('approve');
  });

  it('prévia grande, várias escritas ou pergunta: "Abrir conversa" (ADR 039 §6)', () => {
    expect(pendingCardMode(confirma(1), previa(9))).toBe('open');
    expect(pendingCardMode(confirma(2), previa(3))).toBe('open');
    expect(
      pendingCardMode(
        {
          kind: 'question',
          prompt: 'Qual?',
          actions: [
            { kind: 'question', toolCallId: 'q', messageId: 'm', prompt: 'Qual?', fields: [] },
          ],
        },
        previa(1),
      ),
    ).toBe('open');
    expect(pendingCardMode({ kind: 'continue', prompt: 'Sigo?', actions: [] }, previa(1))).toBe(
      'open',
    );
    expect(pendingCardMode(confirma(1), previa(2, false))).toBe('open');
  });

  it('sem prévia carregada ainda, não aprova', () => {
    expect(pendingCardMode(confirma(1), null)).toBe('open');
    expect(pendingCardMode(confirma(1), undefined)).toBe('open');
  });
});
