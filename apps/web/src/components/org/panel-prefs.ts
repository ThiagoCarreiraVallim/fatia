/**
 * Preferências de interface do painel (#398), guardadas no navegador por
 * pessoa e comunidade (a chave leva o `membershipId`). Só preferência de UI:
 * o menu recolhido, os grupos fechados e os recentes da busca. Sem
 * `localStorage` (aba privada, bloqueio), tudo volta ao padrão.
 */

export interface NavPrefs {
  collapsed: boolean;
  closedGroups: string[];
}

export interface RecentEntry {
  id: string;
  kind: 'member' | 'screen' | 'plan';
  title: string;
  subtitle: string;
  href: string;
}

const NAV_KEY = (membershipId: string) => `fatia:panel:nav:${membershipId}`;
const RECENT_KEY = (membershipId: string) => `fatia:panel:recent:${membershipId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem armazenamento: a escolha vale só nesta visita.
  }
}

export const readNavPrefs = (membershipId: string): NavPrefs =>
  read(NAV_KEY(membershipId), { collapsed: false, closedGroups: [] as string[] });
export const writeNavPrefs = (membershipId: string, prefs: NavPrefs) =>
  write(NAV_KEY(membershipId), prefs);

export function readRecents(membershipId: string): RecentEntry[] {
  const r = read<{ items: RecentEntry[] }>(RECENT_KEY(membershipId), { items: [] });
  return Array.isArray(r.items) ? r.items : [];
}
export const writeRecents = (membershipId: string, items: RecentEntry[]) =>
  write(RECENT_KEY(membershipId), { items });

const COLUMNS_KEY = (membershipId: string) => `fatia:panel:overview-columns:${membershipId}`;

/** As colunas escolhidas na tabela da Visão geral; nulo = o padrão (todas). */
export function readOverviewColumns(membershipId: string): string[] | null {
  const r = read<{ columns: string[] | null }>(COLUMNS_KEY(membershipId), { columns: null });
  return Array.isArray(r.columns) ? r.columns : null;
}
export const writeOverviewColumns = (membershipId: string, columns: string[]) =>
  write(COLUMNS_KEY(membershipId), { columns });

/**
 * Apaga as preferências do painel deste navegador (`fatia:panel:*`). Vai junto
 * com o "Sair": os recentes da busca têm nomes de membros, e o próximo a usar
 * o navegador não deve vê-los.
 */
export function clearPanelPrefs(): void {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith('fatia:panel:')) chaves.push(k);
    }
    for (const k of chaves) window.localStorage.removeItem(k);
  } catch {
    // Sem armazenamento, nada a limpar.
  }
}
