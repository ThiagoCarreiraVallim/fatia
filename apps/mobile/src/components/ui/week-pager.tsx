import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { moveAnchor, pageIndexOf, weekPages } from './week-pager-math';

/** Até onde a faixa arrasta: três anos para trás, um para frente. */
const RANGE = { back: 156, forward: 52 };

/**
 * A faixa de dias que arrasta de semana em semana (#479), a mesma no Treino e
 * na Nutrição. Cada página é uma semana; ela acompanha o dedo e assenta na
 * semana seguinte ou na anterior, com a animação da própria rolagem.
 *
 * As páginas são fixas (de `RANGE` em volta da semana de hoje, calculadas uma
 * vez): trocar de semana não troca a lista, então a página que assentou não
 * pisca para recentralizar, como num carrossel de três páginas.
 *
 * `bleed` é o padding do pai: a faixa sai dele e cada página o devolve por
 * dentro, para a semana vizinha entrar pela borda da tela (#477).
 */
export function WeekPager({
  anchor,
  today,
  onAnchorChange,
  renderWeek,
  bleed = 0,
  height = 64,
}: {
  /** Um dia da semana mostrada (o dia escolhido, na Nutrição). */
  anchor: string;
  today: string;
  /** O mesmo dia da semana na semana para onde a pessoa arrastou. */
  onAnchorChange: (anchor: string) => void;
  /** Os sete dias da semana que começa em `monday`. */
  renderWeek: (monday: string) => ReactNode;
  bleed?: number;
  /** Altura da faixa, para reservar o lugar antes de medir a largura. */
  height?: number;
}) {
  // A lista nasce da semana de hoje e não muda depois: assim um índice é
  // sempre a mesma semana, mesmo depois da virada do dia.
  const [pages] = useState(() => weekPages(today, RANGE));
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<string>>(null);
  const index = pageIndexOf(pages, anchor);
  // A página que está na tela; o efeito abaixo só rola quando o dia escolhido
  // mudou por fora (ex.: a virada do dia), nunca depois de um arrasto.
  const shown = useRef(index);

  useEffect(() => {
    if (!width || shown.current === index) return;
    shown.current = index;
    list.current?.scrollToIndex({ index, animated: true });
  }, [index, width]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const to = Math.round(e.nativeEvent.contentOffset.x / width);
    if (to === shown.current || to < 0 || to >= pages.length) return;
    const from = shown.current;
    shown.current = to;
    onAnchorChange(moveAnchor(anchor, from, to));
  };

  return (
    <View
      style={{ marginHorizontal: -bleed, minHeight: height }}
      // Sem arredondar: 0,4 px a menos por página, vezes as 156 semanas de trás,
      // deixava a semana assentada torta.
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width ? (
        <FlatList
          ref={list}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={pages}
          keyExtractor={(monday) => monday}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          // Só a semana na tela e as vizinhas: o resto nem monta.
          initialNumToRender={1}
          windowSize={3}
          maxToRenderPerBatch={2}
          onMomentumScrollEnd={settle}
          renderItem={({ item }) => (
            <View style={{ width, paddingHorizontal: bleed }}>{renderWeek(item)}</View>
          )}
        />
      ) : null}
    </View>
  );
}
