/**
 * Contas do plano recebido no app (#379) que não dependem de tela. O estágio
 * da resposta e os botões de baixo moram no api-client (`offerStage`,
 * `offerActions`), iguais no web.
 */

/** O fuso do aparelho, para "hoje 09:12" no remetente. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}
