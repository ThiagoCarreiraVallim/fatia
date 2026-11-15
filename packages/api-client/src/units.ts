/**
 * Unidades de exibição (Você › Unidades, pranchas Al-V10/V10b, #387).
 *
 * O banco e a API continuam métricos — carga em kg, distância em metros. A
 * pessoa escolhe como **vê**; o que ela digita na unidade dela volta para kg e
 * metros antes de sair do aparelho. A equipe vê na unidade dela, nunca na do
 * aluno. Só carga e distância: é o que a prancha mostra.
 *
 * Sem `toLocaleString`: o Hermes de parte dos Androids cai para o formato
 * americano sem avisar (mesmo motivo de `format.ts`).
 */

export type LoadUnit = 'KG' | 'LB';
export type DistanceUnit = 'KM' | 'M' | 'MI';

export interface UnitPrefs {
  loadUnit: LoadUnit;
  distanceUnit: DistanceUnit;
}

/** O padrão do Brasil: o que vale enquanto a pessoa não muda nada. */
export const BRAZIL_UNITS: UnitPrefs = { loadUnit: 'KG', distanceUnit: 'KM' };

export const KG_PER_LB = 0.45359237;
export const METERS_PER_MILE = 1609.344;

export const LOAD_UNIT_OPTIONS: { value: LoadUnit; label: string }[] = [
  { value: 'KG', label: 'kg' },
  { value: 'LB', label: 'lb' },
];

export const DISTANCE_UNIT_OPTIONS: { value: DistanceUnit; label: string }[] = [
  { value: 'KM', label: 'km' },
  { value: 'M', label: 'm' },
  { value: 'MI', label: 'milhas' },
];

/** Preferências do perfil, com o padrão quando o perfil ainda não carregou. */
export function unitPrefsOf(me: Partial<UnitPrefs> | null | undefined): UnitPrefs {
  return {
    loadUnit: me?.loadUnit ?? BRAZIL_UNITS.loadUnit,
    distanceUnit: me?.distanceUnit ?? BRAZIL_UNITS.distanceUnit,
  };
}

export function isBrazilDefault(p: UnitPrefs): boolean {
  return p.loadUnit === BRAZIL_UNITS.loadUnit && p.distanceUnit === BRAZIL_UNITS.distanceUnit;
}

/** `115,7` / `60` — vírgula decimal, sem `,0` sobrando. */
function decimal(value: number, places: number): string {
  const fixo = value.toFixed(places);
  const [inteira, frac = ''] = fixo.split('.');
  const limpa = frac.replace(/0+$/, '');
  return limpa ? `${inteira},${limpa}` : inteira!;
}

/** `5.200` — milhar com ponto, à mão (ver o topo do arquivo). */
function thousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function loadUnitLabel(unit: LoadUnit): string {
  return unit === 'LB' ? 'lb' : 'kg';
}

export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === 'MI' ? 'milhas' : unit === 'M' ? 'm' : 'km';
}

/** kg → número na unidade da pessoa. */
export function kgToLoad(kg: number, unit: LoadUnit): number {
  return unit === 'LB' ? kg / KG_PER_LB : kg;
}

/** O que a pessoa digitou na unidade dela → kg, para a API. */
export function loadToKg(value: number, unit: LoadUnit): number {
  return unit === 'LB' ? Math.round(value * KG_PER_LB * 1000) / 1000 : value;
}

/** Só o número da carga (`82,5`, `181,9`), para campos e colunas que já dizem a unidade. */
export function loadNumber(kg: number | null | undefined, unit: LoadUnit): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return decimal(kgToLoad(kg, unit), unit === 'LB' ? 1 : 2);
}

/** `52,5 kg` / `115,7 lb`. */
export function formatLoad(kg: number | null | undefined, unit: LoadUnit): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${loadNumber(kg, unit)} ${loadUnitLabel(unit)}`;
}

/** `5,2 km` / `5.200 m` / `3,2 milhas`. */
export function formatDistanceIn(meters: number | null | undefined, unit: DistanceUnit): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (unit === 'M') return `${thousands(meters)} m`;
  if (unit === 'MI') return `${decimal(meters / METERS_PER_MILE, 1)} milhas`;
  return `${decimal(meters / 1000, 2)} km`;
}

/** Metros → número na unidade da pessoa, para o campo (`5.2` km, `3.23` milhas). */
export function metersToDistance(meters: number, unit: DistanceUnit): number {
  if (unit === 'M') return Math.round(meters);
  if (unit === 'MI') return Math.round((meters / METERS_PER_MILE) * 100) / 100;
  return Math.round(meters) / 1000;
}

/** Carga para o campo de edição: uma casa em lb, como foi digitada em kg. */
export function loadFieldValue(kg: number, unit: LoadUnit): number {
  return unit === 'LB' ? Math.round(kgToLoad(kg, unit) * 10) / 10 : kg;
}

/** Distância digitada na unidade da pessoa → metros. */
export function distanceToMeters(value: number, unit: DistanceUnit): number {
  if (unit === 'M') return value;
  if (unit === 'MI') return Math.round(value * METERS_PER_MILE);
  return Math.round(value * 1000);
}

/** A linha "Unidades" de Você: `kg · km`. */
export function unitsSummary(p: UnitPrefs): string {
  return `${loadUnitLabel(p.loadUnit)} · ${distanceUnitLabel(p.distanceUnit)}`;
}

/** A prévia da tela de Unidades: um recorde de supino e uma corrida, ao vivo. */
export function unitsPreview(p: UnitPrefs): { bench: string; run: string; equivalence: string } {
  const supinoKg = 52.5;
  const corridaM = 5200;
  return {
    bench: `${formatLoad(supinoKg, p.loadUnit)} × 10`,
    run: formatDistanceIn(corridaM, p.distanceUnit),
    equivalence:
      p.loadUnit === 'LB'
        ? `${formatLoad(supinoKg, 'KG')} = ${formatLoad(supinoKg, 'LB')}`
        : `${formatLoad(supinoKg, 'LB')} = ${formatLoad(supinoKg, 'KG')}`,
  };
}
