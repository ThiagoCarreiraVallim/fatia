import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNDO_MS } from '@fatia/api-client';

/**
 * Aviso curto no rodapé, com uma ação opcional ("Desfazer"). Espelho do
 * `sonner` do PWA, feito à mão: é um componente só, e uma dependência nativa
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

/** Acima da barra de baixo (80) com folga, como o "Registrar" ficava. */
const DISTANCIA_DO_RODAPE = 96;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    setToast({ ...input, id: nextId.current });
    // A região viva do Android não cobre o iOS; o anúncio cobre os dois.
    AccessibilityInfo.announceForAccessibility(
      input.action ? `${input.message}. ${input.action.label} disponível.` : input.message,
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [toast, opacity]);

  useEffect(() => {
    if (!toast) opacity.setValue(0);
  }, [toast, opacity]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: DISTANCIA_DO_RODAPE + insets.bottom,
            opacity,
          }}
        >
          <View
            accessibilityLiveRegion="polite"
            className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2"
          >
            <Text className="flex-1 text-sm text-foreground">{toast.message}</Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={8}
                onPress={() => {
                  const action = toast.action;
                  setToast(null);
                  action?.onPress();
                }}
                className="min-h-11 justify-center px-2"
              >
                <Text className="text-sm font-bold text-primary">{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
