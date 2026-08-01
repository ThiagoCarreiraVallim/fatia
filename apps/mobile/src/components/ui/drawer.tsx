import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { cn } from './utils';

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
 */

export function Drawer({
  open,
  onOpenChange,
  children,
  /**
   * Altura. `undefined` deixa o conteúdo definir (bom para formulário curto);
   * uma lista longa deve fixar, senão o sheet abre ocupando a tela inteira.
   */
  snapPoints,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  snapPoints?: (string | number)[];
}) {
  const ref = useRef<BottomSheet>(null);

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

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
      enableDynamicSizing={!snapPoints}
      enablePanDownToClose
      onChange={(index) => {
        if (index === -1) onOpenChange(false);
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: '#131313' }}
      handleIndicatorStyle={{ backgroundColor: '#201f1f', width: 48 }}
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

export function DrawerContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <BottomSheetView>
      <View className={cn('bg-background pb-8', className)}>{children}</View>
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
      className={cn('text-lg font-semibold text-foreground', className)}
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
