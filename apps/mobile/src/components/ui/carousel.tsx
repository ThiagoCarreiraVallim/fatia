import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { cn } from './utils';

/**
 * Carrossel paginado — substitui o `embla` do PWA.
 *
 * `FlatList` horizontal com `pagingEnabled` já é o comportamento nativo
 * esperado, e recicla os itens: o carrossel de treinos rápidos tem 9 cards com
 * imagem, e montar os nove de uma vez trava a rolagem em aparelho de entrada.
 *
 * `snapToInterval` (em vez de `pagingEnabled` puro) é o que permite card com
 * largura menor que a tela e uma prévia do próximo — o desenho que o PWA usa.
 */
export function Carousel<T>({
  data,
  renderItem,
  keyExtractor,
  itemWidth,
  gap = 12,
  className,
  showDots = true,
}: {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  itemWidth: number;
  gap?: number;
  className?: string;
  showDots?: boolean;
}) {
  const [active, setActive] = useState(0);
  const interval = itemWidth + gap;
  const lastIndex = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / interval);
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        setActive(index);
      }
    },
    [interval],
  );

  return (
    <View className={className}>
      <FlatList
        horizontal
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Sem isto o React Native mede cada item durante a rolagem, o que
        // aparece como engasgo no primeiro swipe.
        getItemLayout={(_, index) => ({
          length: interval,
          offset: interval * index,
          index,
        })}
      />
      {showDots && data.length > 1 ? (
        <View className="mt-3 flex-row justify-center gap-1.5">
          {data.map((item, index) => (
            <View
              key={keyExtractor(item, index)}
              className={cn(
                'h-1.5 rounded-full',
                index === active ? 'w-4 bg-primary' : 'w-1.5 bg-muted',
              )}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
