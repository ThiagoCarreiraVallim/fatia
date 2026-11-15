import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { figureTone } from '@fatia/api-client';
import { colors } from '@/theme/colors';
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
 * As cores de destaque são as mesmas do PWA de propósito, e são tokens (ADR
 * 041): verde da marca no principal, água no secundário.
 */

/**
 * Os cinzas fixos do desenho viram tokens do tema (`figureTone`, o mesmo do
 * PWA): o músculo apagado no cinza do card, a pele um tom acima e o contorno na
 * cor do card. Sem isso o boneco ficava claro e lavado no tema escuro.
 */
function themed(original: string | null | undefined): string | undefined {
  const tone = figureTone(original);
  if (tone === 'surface-3') return colors.surface3;
  if (tone === 'border-strong') return colors.borderStrong;
  if (tone === 'card') return colors.card;
  if (tone === 'transparent') return 'transparent';
  return original ?? undefined;
}

interface MuscleDiagramProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  view?: 'front' | 'back' | 'both';
  /** Largura de cada boneco. O PWA usa `w-32` (128px). */
  width?: number;
  /**
   * Cor por músculo (chave `data-muscle`), no lugar de principal/secundário:
   * o "Seus músculos hoje" pinta cada um no tom do descanso. Os de fora apagam.
   */
  colors?: Record<string, string>;
  /** Descrição para leitor de tela quando `colors` substitui as listas. */
  accessibilityLabel?: string;
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
            fill={color ?? themed(p.fill) ?? 'none'}
            fillRule={p.fillRule}
            stroke={themed(p.stroke)}
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
  colors: muscleColors,
  accessibilityLabel,
}: MuscleDiagramProps) {
  // Secundário entra primeiro para que um músculo listado nos dois acabe
  // vermelho, como no PWA (lá o segundo `paint` sobrescreve o primeiro).
  const highlight = useMemo(() => {
    if (muscleColors) return new Map(Object.entries(muscleColors));
    const map = new Map<string, string>();
    for (const m of secondaryMuscles) map.set(m, colors.water);
    for (const m of primaryMuscles) map.set(m, colors.primary);
    return map;
  }, [primaryMuscles, secondaryMuscles, muscleColors]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? describeMuscles(primaryMuscles, secondaryMuscles)}
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
