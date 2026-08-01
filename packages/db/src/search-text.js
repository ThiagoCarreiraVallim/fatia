/**
 * Normalização de nome para busca no catálogo (alimentos e exercícios).
 *
 * Mora aqui, e não em `apps/api`, porque os **seeds** também precisam dela: eles
 * escrevem direto no banco, sem passar pelos services. Duas cópias divergiriam
 * no primeiro ajuste, e a divergência apareceria como "esse alimento existe mas
 * a busca não acha" — o tipo de bug que ninguém liga a uma função de string.
 *
 * JavaScript puro pelo mesmo motivo do resto deste pacote: ele é consumido sem
 * passo de build, tanto pelo Nest quanto pelo `tsx` dos seeds.
 *
 * O equivalente em SQL vive na migration `20260801210000_add_search_name`, que
 * fez o backfill do catálogo já semeado. Se esta regra mudar, as linhas
 * existentes precisam ser reprocessadas.
 */

/**
 * Reduz um texto à forma comparável: minúsculo, sem acento, sem pontuação, com
 * espaços colapsados.
 *
 * `NFD` separa a letra do diacrítico e o `replace` remove os diacríticos — vale
 * para todo o Latin-1 (á, ã, ç, ñ, ü…) sem tabela fixa.
 *
 * A pontuação vira espaço porque os nomes da TACO são segmentados por vírgula
 * ("Arroz, tipo 1, cozido"): sem isso, "arroz tipo 1" não casaria.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

module.exports = { normalizeSearchText };
