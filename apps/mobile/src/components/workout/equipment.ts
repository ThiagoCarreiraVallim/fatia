import { EXERCISE_EQUIPMENT, equipmentLabel } from '@fatia/api-client';

/**
 * Regras puras do escolhedor de equipamento (`equipment-chooser.tsx`), fora do
 * componente para o Vitest alcançar — o app não monta React Native em teste.
 */

const comparable = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Os dois nomes são o mesmo equipamento (sem olhar caixa, acento nem espaço extra)? */
export function sameEquipment(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

/**
 * O termo que filtra a lista abaixo do campo de equipamento do exercício.
 *
 * O campo é texto livre e serve de busca ao mesmo tempo. Quando o texto já é
 * um item conhecido (o que a pessoa acabou de tocar), filtrar por ele deixaria
 * só aquele chip na tela, e trocar de ideia exigiria apagar o campo. Nesse caso
 * a lista volta inteira, com o item marcado.
 */
export function chooserQuery(text: string, custom: readonly string[]): string {
  const conhecidos = [...EXERCISE_EQUIPMENT, ...custom];
  const t = text.trim();
  if (!t) return '';
  const conhecido = conhecidos.some(
    (e) => sameEquipment(e, t) || sameEquipment(equipmentLabel(e), t),
  );
  return conhecido ? '' : t;
}

/** Liga ou desliga um item num conjunto, sem mexer no original (estado do React). */
export function toggled(set: ReadonlySet<string>, key: string): Set<string> {
  const proximo = new Set(set);
  if (proximo.has(key)) proximo.delete(key);
  else proximo.add(key);
  return proximo;
}
