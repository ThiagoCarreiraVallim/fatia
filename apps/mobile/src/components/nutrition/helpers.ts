import type { TextStyle } from 'react-native';
import { addDays, format, getDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ApiError, type Food, type MealType } from '@fatia/api-client';

/**
 * Lógica pura da fatia de nutrição.
 *
 * Fica fora dos componentes porque é o único pedaço testável sem renderizar
 * React Native (ver `vitest.config.ts`) — e porque as mesmas contas aparecem em
 * três telas e cinco componentes.
 */

export const ROTULO_REFEICAO: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  DINNER: 'Jantar',
  SNACK: 'Lanche',
};

export const EMOJI_REFEICAO: Record<MealType, string> = {
  BREAKFAST: '☀️',
  LUNCH: '🍽️',
  DINNER: '🌙',
  SNACK: '🍎',
};

export const TIPOS_DE_REFEICAO: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** `tabular-nums` não existe como utilitário no NativeWind; no RN é estilo. */
export const NUMEROS_TABULARES: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Meio-dia local em vez de meia-noite: somar ou subtrair dias a partir da
 * meia-noite cai no dia anterior em fuso com horário de verão.
 */
function aoMeioDia(iso: string): Date {
  return parseISO(`${iso}T12:00:00`);
}

export function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Instante a gravar em `eatenAt` para o dia selecionado na tela.
 *
 * No dia de hoje vale a hora de agora, que é o dado real. Em dia passado não
 * existe "agora": gravar `new Date()` põe a refeição em **hoje**, enquanto a
 * tela invalida e lê o dia selecionado — o item some da vista e a pessoa
 * registra de novo, agora duplicado. Meio-dia local pelo mesmo motivo de
 * `aoMeioDia`: meia-noite cai no dia anterior em fuso com horário de verão.
 */
export function instanteNoDia(iso: string): string {
  return iso === hojeIso() ? new Date().toISOString() : aoMeioDia(iso).toISOString();
}

export function deslocarDia(iso: string, dias: number): string {
  return format(addDays(aoMeioDia(iso), dias), 'yyyy-MM-dd');
}

/**
 * `ter, 19/05` — o mesmo que `toLocaleDateString('pt-BR', { weekday: 'short' })`
 * do PWA. `EEEEEE` (short) e não `EEE` (abbreviated): em pt-BR o abreviado do
 * date-fns é a palavra inteira, `terça`.
 */
export function formatarDiaCurto(iso: string): string {
  return format(aoMeioDia(iso), 'EEEEEE, dd/MM', { locale: ptBR });
}

export function formatarHora(dataHoraIso: string): string {
  return format(new Date(dataHoraIso), 'HH:mm');
}

const INICIAIS_DOS_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function inicialDoDia(iso: string): string {
  return INICIAIS_DOS_DIAS[getDay(aoMeioDia(iso))];
}

export function parsePositivo(valor: string): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseNaoNegativo(valor: string): number | undefined {
  if (valor.trim() === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface PreviaDeMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Prévia dos macros do alimento na quantidade digitada (tabela é por 100 g). */
export function previaDoAlimento(food: Food, gramas: string): PreviaDeMacros | null {
  const g = parsePositivo(gramas);
  if (g === null) return null;
  const proporcao = g / 100;
  return {
    kcal: Math.round(food.kcalPer100g * proporcao),
    proteinG: Math.round(food.proteinPer100g * proporcao),
    carbsG: Math.round(food.carbsPer100g * proporcao),
    fatG: Math.round(food.fatPer100g * proporcao),
  };
}

export function totalKcal(itens: Array<{ kcal: number }>): number {
  return itens.reduce((soma, item) => soma + item.kcal, 0);
}

/** `120g · 210 kcal · P8 C20 G3` */
export function resumoDoItem(item: {
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): string {
  return `${item.grams}g · ${Math.round(item.kcal)} kcal · P${Math.round(item.proteinG)} C${Math.round(
    item.carbsG,
  )} G${Math.round(item.fatG)}`;
}

export const MENSAGEM_DE_CONFLITO = 'Essa refeição já foi registrada.';

/**
 * A API recusa refeição duplicada por chave natural com `409 CONFLICT`. Mostrar
 * "HTTP 409" ou "falha ao salvar" faz a pessoa achar que não salvou e registrar
 * de novo — daí a mensagem própria para esse status.
 */
export function mensagemDeErro(
  erro: unknown,
  opcoes?: { conflito?: string; alternativa?: string },
): string {
  if (erro instanceof ApiError && erro.isConflict) {
    return opcoes?.conflito ?? MENSAGEM_DE_CONFLITO;
  }
  if (erro instanceof Error && erro.message) return erro.message;
  return opcoes?.alternativa ?? 'Não foi possível concluir. Tente de novo.';
}

/** Percentual da meta, limitado a 100 — a barra nunca passa da largura. */
export function percentualDaMeta(valor: number, meta: number): number {
  if (!(meta > 0)) return 0;
  return Math.min(100, Math.round((valor / meta) * 100));
}

export function alturaDaBarra(kcal: number, maxKcal: number, alturaMax: number): number {
  if (!(maxKcal > 0)) return 4;
  return Math.max(4, Math.round((kcal / maxKcal) * alturaMax));
}

/**
 * Barra com só o topo arredondado. `rx` do `<Rect>` arredonda os quatro cantos,
 * e a barra do PWA (`rounded-t-md`) nasce colada na linha de base.
 */
export function caminhoDeBarra(x: number, y: number, largura: number, altura: number): string {
  const r = Math.min(6, largura / 2, altura);
  const base = y + altura;
  return [
    `M${x},${base}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + largura - r},${y}`,
    `Q${x + largura},${y} ${x + largura},${y + r}`,
    `L${x + largura},${base}`,
    'Z',
  ].join(' ');
}
