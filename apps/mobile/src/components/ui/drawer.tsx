import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './text';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackgroundProps,
  BottomSheetFlatList,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { cn } from './utils';
import { colors } from '@/theme/colors';
import { SHEET_ANIMATION } from '@/theme/motion';

/**
 * Faz `className` funcionar nos componentes do `@gorhom/bottom-sheet`.
 *
 * O NativeWind converte `className` em `style` só para os componentes do core
 * do React Native. Num componente de terceiro ele passa a prop adiante como
 * está — e a biblioteca, que não conhece `className`, a ignora. O sintoma é
 * cruel porque não é erro: o campo renderiza, com a cor de texto padrão do
 * sistema, praticamente invisível sobre o fundo escuro do app.
 *
 * `cssInterop` registra a tradução uma vez, aqui, em vez de obrigar cada tela a
 * lembrar de escrever `style` no lugar de `className` dentro de drawer.
 */
cssInterop(BottomSheetTextInput, { className: 'style' });
cssInterop(BottomSheetView, { className: 'style' });
cssInterop(BottomSheetScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});
cssInterop(BottomSheetFlatList, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});

/**
 * Bottom sheet com a API do drawer do PWA (`vaul`): `<Drawer open onOpenChange>`
 * envolvendo `<DrawerContent>`.
 *
 * Boa parte dos fluxos do app é drawer — busca de alimento, edição de item, log
 * de peso/passos/água, seletor de exercício, nova meta. Vale insistir em três
 * detalhes que, errados, fazem o app inteiro parecer mal feito:
 *
 * 1. **Campo de texto dentro do sheet** precisa ser `DrawerTextInput`, não
 *    `Input`. Um `TextInput` comum não avisa o sheet que o teclado subiu, e o
 *    campo fica escondido atrás dele — exatamente o que acontece na busca de
 *    alimento, o drawer mais usado do produto.
 * 2. **Lista dentro do sheet** precisa ser `DrawerScrollView`/`DrawerFlatList`.
 *    Um `ScrollView` comum disputa o gesto com o arrasto do sheet: a lista fica
 *    presa, ou o sheet fecha quando a pessoa quis rolar.
 * 3. **Fechar pelo gesto** tem que refletir no estado. `onChange(-1)` chama
 *    `onOpenChange(false)`; sem isso o `open` do React fica `true` depois do
 *    sheet sumir, e a próxima abertura não acontece.
 *
 * ## Onde montar — a diferença que mais confunde quem vem do PWA
 *
 * O `vaul` do PWA é um portal: o drawer pode ser declarado dentro do card que o
 * abre, que ele aparece teletransportado no `<body>`. **O bottom sheet nativo
 * não tem portal**: ele se posiciona com `absoluteFill` *dentro do pai*.
 *
 * Declarado onde o PWA declara — dentro de um card de 150 px, dentro do
 * `ScrollView` da tela — o sheet abre com 150 px de altura, em cima do card, e
 * rola junto com o conteúdo.
 *
 * Por isso todo drawer é **irmão** do `<Screen>`, dentro de um `<DrawerLayer>`.
 * Na prática, o componente que antes renderizava o próprio drawer passa a
 * receber um callback (`onEditItem`, `openPicker`, `onAddExercise`) e a tela
 * monta o drawer lá em cima. É mais verboso que no web, e é o preço de não ter
 * portal.
 */

/**
 * Quantos drawers estão abertos agora, no app inteiro.
 *
 * O sheet não tem portal: ele abre dentro da tela (o `Slot`), e a barra de
 * baixo mora fora dela, por cima (com `elevation` no Android). Nenhum `zIndex`
 * da tela passa da barra, que então cobria os botões do rodapé do sheet. Por
 * isso a barra e o botão da IA somem enquanto houver um drawer aberto
 * (`useAnyDrawerOpen`), como na web, onde o fundo escuro da folha os cobre.
 */
const DrawerPresence = createContext<{ add: () => () => void; count: number } | null>(null);

export function DrawerPresenceProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const add = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ add, count }), [add, count]);
  return <DrawerPresence.Provider value={value}>{children}</DrawerPresence.Provider>;
}

/** Algum drawer aberto? Fora do provider, `false`. */
export function useAnyDrawerOpen(): boolean {
  return (useContext(DrawerPresence)?.count ?? 0) > 0;
}

export function Drawer({
  open,
  onOpenChange,
  children,
  /**
   * Altura. `undefined` deixa o conteúdo definir (bom para formulário curto);
   * uma lista longa deve fixar, senão o sheet abre ocupando a tela inteira.
   */
  snapPoints,
  topInset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  snapPoints?: (string | number)[];
  /** Com `snapPoints={['100%']}`: onde a folha para no topo (a área segura), para a tela cheia (Al-T8). */
  topInset?: number;
}) {
  const ref = useRef<BottomSheet>(null);
  const add = useContext(DrawerPresence)?.add;

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  // Aberto, esconde a barra de baixo (ver `DrawerPresence`).
  useEffect(() => (open && add ? add() : undefined), [open, add]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (!open) return null;

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      topInset={topInset}
      enableDynamicSizing={!snapPoints}
      enablePanDownToClose
      // 550 ms com a curva do DS; com reduzir movimento, pula para o fim.
      animationConfigs={SHEET_ANIMATION}
      onChange={(index) => {
        if (index === -1) onOpenChange(false);
      }}
      backdropComponent={renderBackdrop}
      // Fundo por classe, não por `colors.background`: assim fundo e texto
      // (`text-foreground`) saem da mesma variável do tema, e nunca de temas
      // diferentes quando o JS e o NativeWind divergem por um instante.
      backgroundComponent={SheetBackground}
      handleIndicatorStyle={{ backgroundColor: colors.muted, width: 48 }}
      // `interactive` acompanha o teclado enquanto ele sobe, em vez de saltar
      // para a posição final — é o que torna digitar dentro do sheet suportável.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {children}
    </BottomSheet>
  );
}

function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={style} className="rounded-t-sheet bg-background" />;
}

/**
 * Camada onde os drawers de uma tela são montados, irmã do `<Screen>`.
 *
 * Ocupa a tela inteira, acima do conteúdo da tela. A barra de baixo fica
 * fora da tela e some enquanto um drawer está aberto (`DrawerPresence`), já
 * que nenhum `zIndex` daqui passa dela. `box-none` deixa o toque passar
 * quando nenhum drawer está aberto — sem isso a camada engoliria todo toque da
 * tela.
 *
 * ```tsx
 * <>
 *   <Screen>…</Screen>
 *   <DrawerLayer>
 *     <MeuDrawer open={aberto} onOpenChange={setAberto} />
 *   </DrawerLayer>
 * </>
 * ```
 */
export function DrawerLayer({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
      {children}
    </View>
  );
}

export function DrawerContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // O rodapé (botões) fica acima da barra de gestos/navegação do sistema.
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetView>
      <View
        style={{ paddingBottom: insets.bottom + 24 }}
        className={cn('bg-background', className)}
      >
        {children}
      </View>
    </BottomSheetView>
  );
}

export function DrawerHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <View className={cn('gap-1.5 px-4 pb-2 pt-1', className)}>{children}</View>;
}

export function DrawerTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className={cn('font-display-semibold text-lg text-foreground', className)}
    >
      {children}
    </Text>
  );
}

export function DrawerDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <Text className={cn('text-sm text-muted-foreground', className)}>{children}</Text>;
}

export function DrawerFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <View className={cn('gap-2 px-4 pt-2', className)}>{children}</View>;
}

export {
  BottomSheetScrollView as DrawerScrollView,
  BottomSheetFlatList as DrawerFlatList,
  BottomSheetTextInput as DrawerTextInput,
};
