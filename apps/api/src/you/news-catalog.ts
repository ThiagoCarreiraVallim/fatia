/**
 * As novidades do app (Você › Novidades, prancha Al-V11). Vivem em código, como
 * o catálogo de conquistas: cada uma entra no mesmo deploy da função que ela
 * anuncia, sem migration por entrada, e o banco guarda só o que a pessoa leu
 * (`UserNewsRead`).
 *
 * O `id` é estável e nunca reaproveitado: é ele que fica gravado como lido.
 * Mais nova primeiro. Só entra o que já está no ar — novidade de função que
 * ainda não existe é promessa, não novidade.
 */
export interface NewsEntry {
  id: string;
  /** AAAA-MM-DD. */
  date: string;
  title: string;
  body: string;
  /** Nome do ícone do design system (`@fatia/design`). */
  icon: string;
  /** Cor do selo do ícone na lista (`chipic` do canvas). */
  tone: 'lime' | 'amber' | 'blue' | 'neutral';
  /** Tela que a novidade abre, no mapa de rotas comum (`navigation.ts`). */
  href: string | null;
}

export const NEWS: readonly NewsEntry[] = [
  {
    id: 'unidades',
    date: '2026-11-14',
    title: 'Unidades',
    body: 'Carga em kg ou lb, distância em km, metros ou milhas. Muda só como você vê.',
    icon: 'ruler',
    tone: 'lime',
    href: '/you/units',
  },
  {
    id: 'exportar-por-link',
    date: '2026-11-14',
    title: 'Exportar por link',
    body: 'Seus dados saem num arquivo, com um link que vale 24 horas.',
    icon: 'download',
    tone: 'blue',
    href: '/you',
  },
  {
    id: 'menu-da-ia',
    date: '2026-11-14',
    title: 'Menu da IA',
    body: 'No botão verde: registre à mão, mande a foto do prato ou fale com a IA.',
    icon: 'spark',
    tone: 'amber',
    href: '/',
  },
  {
    id: 'tema-claro',
    date: '2026-11-10',
    title: 'Tema claro',
    body: 'Escolha escuro, claro ou o do celular em Aparência.',
    icon: 'sun',
    tone: 'neutral',
    href: '/profile/appearance',
  },
];

export const NEWS_IDS = new Set(NEWS.map((n) => n.id));
