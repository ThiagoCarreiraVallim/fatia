import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toastDuration } from '@/theme/motion-values';
import { Text } from './text';
import { TOAST_IDLE, toastReducer } from './toast-queue';

/**
 * Aviso curto que cai do topo com mola (prancha Movimento · Toast) e sobe ao
 * sair, com uma ação opcional ("Desfazer"). Chegando outro com um na tela, o
 * atual sai antes e o novo entra de cima (`toast-queue.ts`, #471). Espelho do
 * `Toaster` do PWA: fundo claro sobre o
 * escuro (e o contrário no claro), some em 2,5 s, ou 5 s com ação
 * (`toastDuration`). Feito à mão: é um componente só, e uma dependência nativa
 * para isso pediria um build novo do app.
 *
 * Fica na raiz (`app/_layout.tsx`), acima da barra e dos drawers: o aviso de
 * "apagado" nasce dentro de um drawer e tem de continuar visível nele.
 */

interface ToastInput {
  message: string;
  action?: { label: string; onPress: () => void };
}

interface ToastState extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (toast: ToastInput) => void }>({
  show: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

/** De onde o toast cai: acima da borda de cima, fora da tela. */
const START_Y = -96;

/** Saída: sobe de volta e apaga, mais rápida que a entrada. */
const EXIT_MS = 180;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [slot, dispatch] = useReducer(toastReducer<ToastState>, TOAST_IDLE);
  const toast = slot.visible;
  // Invariante (#471): fora da vez (`idle`) os valores ficam sempre fora da
  // tela. Começam assim e a saída termina assim, então o toast novo já nasce
  // em cima, no primeiro quadro, sem passar pela posição do anterior.
  const translateY = useSharedValue(START_Y);
  const opacity = useSharedValue(0);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    dispatch({ type: 'show', toast: { ...input, id: nextId.current } });
    // A região viva do Android não cobre o iOS; o anúncio cobre os dois.
    AccessibilityInfo.announceForAccessibility(
      input.action ? `${input.message}. ${input.action.label} disponível.` : input.message,
    );
  }, []);

  const exited = useCallback(() => dispatch({ type: 'exited' }), []);

  useEffect(() => {
    if (!toast) return;
    if (slot.phase === 'entering') {
      // "Reduzir movimento" ligado: a mola pula direto para o fim.
      translateY.value = withSpring(0, {
        damping: 16,
        stiffness: 220,
        reduceMotion: ReduceMotion.System,
      });
      opacity.value = withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System });
      const timer = setTimeout(
        () => dispatch({ type: 'dismiss' }),
        toastDuration(Boolean(toast.action)),
      );
      return () => clearTimeout(timer);
    }
    // Saindo (o tempo acabou ou chegou outro): sobe e apaga; no fim, os valores
    // ficam de novo fora da tela e a vez passa para o da fila.
    const config = { duration: EXIT_MS, reduceMotion: ReduceMotion.System };
    opacity.value = withTiming(0, config);
    translateY.value = withTiming(START_Y, config, () => {
      'worklet';
      translateY.value = START_Y;
      opacity.value = 0;
      scheduleOnRN(exited);
    });
    return undefined;
  }, [toast, slot.phase, translateY, opacity, exited]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          // Saindo, não recebe toque: o "Desfazer" de um toast que já foi não vale.
          pointerEvents={slot.phase === 'leaving' ? 'none' : 'box-none'}
          style={[{ position: 'absolute', left: 16, right: 16, top: insets.top + 12 }, style]}
        >
          <View
            accessibilityLiveRegion="polite"
            className="min-h-12 flex-row items-center gap-3 rounded-field bg-foreground px-4 py-2"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 15,
              shadowOffset: { width: 0, height: 16 },
              elevation: 8,
            }}
          >
            <Text className="flex-1 font-sans-bold text-sm text-background">{toast.message}</Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={8}
                onPress={() => {
                  const action = toast.action;
                  dispatch({ type: 'dismiss' });
                  action?.onPress();
                }}
                className="min-h-11 justify-center px-2"
              >
                <Text className="font-sans-bold text-sm text-background underline">
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
