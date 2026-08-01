import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { describeMuscles } from './muscle-labels';
import type { MusclePath } from './muscle-path';
import { BACK_PATHS, BACK_VIEW_BOX } from './muscle-paths-back';
import { FRONT_PATHS, FRONT_VIEW_BOX } from './muscle-paths-front';

/**
 * Réplica de `apps/web/src/components/workout/muscle-diagram.tsx`.
 *
 * O PWA carrega os dois SVGs num `<object>` e pinta os grupos pelo DOM interno
 * (`g[data-muscle]`). Nada disso existe aqui: `react-native-svg` não tem CSS,
 * nem seletor de atributo, nem documento aninhado. Então os traços viraram dado
 * (`muscle-paths-front.ts` / `-back.ts`), cada um carregando o `id` do grupo e o
 * `data-muscle` do arquivo original, e a pintura é uma decisão por traço.
 *
 * As cores de destaque são as mesmas do PWA de propósito — vermelho e laranja
 * não são tokens do tema, são a convenção "principal / secundário" que a pessoa
 * já aprendeu no navegador.
 */

const PRIMARY_FILL = '#ef4444';
const SECONDARY_FILL = '#f97316';
/** Mesma atenuação do `opacity: 0.2` que o PWA aplica no grupo não destacado. */
const DIMMED_OPACITY = 0.2;

interface MuscleDiagramProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  view?: 'front' | 'back' | 'both';
  /** Largura de cada boneco. O PWA usa `w-32` (128px). */
  width?: number;
}

function BodyView({
  paths,
  viewBox,
  width,
  highlight,
}: {
  paths: MusclePath[];
  viewBox: string;
  width: number;
  highlight: Map<string, string>;
}) {
  const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
  const height = (width * vbHeight) / vbWidth;

  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      {paths.map((p, index) => {
        const color = p.muscle ? highlight.get(p.muscle) : undefined;
        return (
          <Path
            // O `d` não é único (traços espelhados repetem), e a lista é
            // estática — o índice é a única chave estável aqui.
            key={`${p.group ?? 'base'}-${index}`}
            d={p.d}
            fill={color ?? p.fill ?? 'none'}
            fillRule={p.fillRule}
            opacity={p.muscle && !color ? DIMMED_OPACITY : 1}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            strokeLinecap={p.stroke ? 'round' : undefined}
            strokeLinejoin={p.stroke ? 'round' : undefined}
          />
        );
      })}
    </Svg>
  );
}

export function MuscleDiagram({
  primaryMuscles,
  secondaryMuscles = [],
  view = 'both',
  width = 128,
}: MuscleDiagramProps) {
  // Secundário entra primeiro para que um músculo listado nos dois acabe
  // vermelho, como no PWA (lá o segundo `paint` sobrescreve o primeiro).
  const highlight = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of secondaryMuscles) map.set(m, SECONDARY_FILL);
    for (const m of primaryMuscles) map.set(m, PRIMARY_FILL);
    return map;
  }, [primaryMuscles, secondaryMuscles]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeMuscles(primaryMuscles, secondaryMuscles)}
      className="flex-row justify-center gap-2"
    >
      {view === 'front' || view === 'both' ? (
        <BodyView
          paths={FRONT_PATHS}
          viewBox={FRONT_VIEW_BOX}
          width={width}
          highlight={highlight}
        />
      ) : null}
      {view === 'back' || view === 'both' ? (
        <BodyView paths={BACK_PATHS} viewBox={BACK_VIEW_BOX} width={width} highlight={highlight} />
      ) : null}
    </View>
  );
}
