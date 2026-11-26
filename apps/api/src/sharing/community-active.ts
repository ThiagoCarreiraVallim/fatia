/**
 * Quando a comunidade de verdade conta como "ativa" (#412, Pn-21d): é o que
 * troca o item "Demonstração" do menu por "Primeiros passos", com a demo só
 * como link.
 *
 * **Critério provisório, de propósito simples:** pelo menos 5 membros ativos
 * com papel de membro (a equipe não conta). É o mesmo piso da regra dos 5 dos
 * números de grupo: a partir dele o painel já mostra números de verdade, e a
 * demo deixa de ser o melhor jeito de ver o painel funcionando.
 *
 * A #372 (checklist de primeiros passos do dono, "9 de 9") substitui esta
 * função pelo checklist: é o único lugar a trocar.
 */
export const COMMUNITY_ACTIVE_MIN_MEMBERS = 5;

export function isCommunityActive(activeMembers: number): boolean {
  return activeMembers >= COMMUNITY_ACTIVE_MIN_MEMBERS;
}
