/**
 * Regra pura do escolhedor de equipamento (`equipment-chooser.tsx`), fora do
 * componente para o Vitest alcançar — o app não monta React Native em teste.
 * A busca, a comparação de nomes e o termo que filtra a lista moram no
 * `@fatia/api-client`, comuns ao web.
 */

/** Liga ou desliga um item num conjunto, sem mexer no original (estado do React). */
export function toggled(set: ReadonlySet<string>, key: string): Set<string> {
  const proximo = new Set(set);
  if (proximo.has(key)) proximo.delete(key);
  else proximo.add(key);
  return proximo;
}
