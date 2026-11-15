/**
 * Comprimento de um traço feito só de `M` e `L` (o de `weightSparkPath`), para
 * desenhar a linha com `strokeDashoffset`: o `pathLength` do SVG não vale em
 * todo Android.
 */
export function polylineLength(d: string): number {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let length = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    length += Math.hypot(nums[i]! - nums[i - 2]!, nums[i + 1]! - nums[i - 1]!);
  }
  return Math.round(length * 10) / 10;
}
