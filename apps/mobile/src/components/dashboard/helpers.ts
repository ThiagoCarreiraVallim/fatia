import type { TextStyle } from 'react-native';
import { format } from 'date-fns';

/**
 * Lógica pura do dashboard.
 *
 * Separada dos componentes porque é o único pedaço testável sem renderizar
 * React Native (ver `vitest.config.ts`), e porque as mesmas contas — porcentagem
 * de meta, formatação de volume — aparecem em três cards.
 */

/** `tabular-nums` não existe como utilitário no NativeWind; no RN é estilo. */
export const NUMEROS_TABULARES: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Quanto da meta já foi cumprido, de 0 a 100. `null` quando não há meta — o
 * card usa isso para esconder a barra em vez de desenhar uma barra vazia, que
 * pareceria "meta zerada".
 */
export function percentualDaMeta(atual: number, alvo: number | null): number | null {
  if (alvo === null || !Number.isFinite(alvo) || alvo <= 0) return null;
  if (!Number.isFinite(atual)) return 0;
  return Math.min(100, Math.max(0, Math.round((atual / alvo) * 100)));
}

// O volume de água é o mesmo do PWA (`@fatia/api-client`, `format.ts`).
export { formatVolume } from '@fatia/api-client';

/** Ponto médio de uma meta declarada como faixa (mín–máx), como no PWA. */
export function alvoMedio(minimo: number, maximo: number): number {
  return Math.round((minimo + maximo) / 2);
}

/**
 * `HH:mm` de um instante ISO. `format` do date-fns no lugar de
 * `toLocaleTimeString('pt-BR')`: o Hermes de parte dos Androids não tem ICU
 * completo e devolve o horário no formato americano só para alguns usuários.
 */
export function horaDoDia(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return format(data, 'HH:mm');
}
