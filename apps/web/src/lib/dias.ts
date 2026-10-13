import { format, parseISO } from 'date-fns';

/** `yyyy-MM-dd` do dia local de hoje. */
export function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Instante a gravar num registro (`eatenAt`, `loggedAt`) para o dia selecionado
 * na tela. Espelha `instanteNoDia` do mobile (`components/nutrition/helpers.ts`).
 *
 * No dia de hoje vale a hora de agora, que é o dado real. Em dia passado não
 * existe "agora": gravar `new Date()` põe o registro em **hoje**, enquanto a
 * tela invalida e lê o dia selecionado — o item some da vista e a pessoa
 * registra de novo, agora duplicado. Meio-dia local porque meia-noite cai no
 * dia anterior em fuso com horário de verão.
 */
export function instanteNoDia(iso: string): string {
  return iso === hojeIso() ? new Date().toISOString() : parseISO(`${iso}T12:00:00`).toISOString();
}
