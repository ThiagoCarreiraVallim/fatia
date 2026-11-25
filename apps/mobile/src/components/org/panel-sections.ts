import {
  panelSections,
  type GroupRole,
  type PanelLink,
  type PanelSection,
} from '@fatia/api-client';

/**
 * Seções do painel que ainda não têm tela no app: a aba levaria ao "Unmatched
 * Route". "Para revisar" (#399), "Ativação pendente" (#401), "Relatório" e
 * "Origem dos convites" (#400), "Equipe e permissões" (#404) e "Enviar para
 * alunos" (#405) entram com o
 * painel no celular (#414).
 */
export const MOBILE_MISSING_SECTIONS: readonly PanelSection[] = [
  'review',
  'activation',
  'report',
  'origins',
  'team',
  // Programas (#403) entram com o painel no celular; Ofertas nunca: o app não
  // vende fora da loja.
  'programs',
  'offers',
  // Enviar para alunos (#405) entra no app com o painel no celular (Pn-M4, #414).
  'send',
  // Boas-vindas (#410): o editor é do painel na web; no celular, com a #414.
  // O aluno vê as páginas no app (onboarding e Sobre).
  'welcome',
  // Novidades e Integrações (#413): telas do painel na web; no celular, com a #414.
  'updates',
  'integrations',
];

/** As abas do painel no app: as do papel, menos as que não têm tela aqui. */
export function mobilePanelSections(role: GroupRole): PanelLink[] {
  return panelSections(role).filter((s) => !MOBILE_MISSING_SECTIONS.includes(s.section));
}
