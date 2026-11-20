import {
  panelSections,
  type GroupRole,
  type PanelLink,
  type PanelSection,
} from '@fatia/api-client';

/**
 * Seções do painel que ainda não têm tela no app: a aba levaria ao "Unmatched
 * Route". "Para revisar" (#399), "Ativação pendente" (#401), "Relatório" e
 * "Origem dos convites" (#400) e "Equipe e permissões" (#404) entram com o
 * painel no celular (#414).
 */
export const MOBILE_MISSING_SECTIONS: readonly PanelSection[] = [
  'review',
  'activation',
  'report',
  'origins',
  'team',
];

/** As abas do painel no app: as do papel, menos as que não têm tela aqui. */
export function mobilePanelSections(role: GroupRole): PanelLink[] {
  return panelSections(role).filter((s) => !MOBILE_MISSING_SECTIONS.includes(s.section));
}
