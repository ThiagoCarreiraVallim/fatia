import { useEffect, useRef, useState } from 'react';
import { Keyboard, type View } from 'react-native';
import { keyboardOverlap } from './keyboard-overlap';

/**
 * O quanto o teclado cobre a `View` do `ref`, para virar `paddingBottom` dela. Só com
 * `Keyboard` e `measureInWindow`, sem módulo nativo (roda no Expo Go). No Android só há os
 * eventos `Did`; abrir as sugestões ou trocar de teclado dispara outro `keyboardDidShow`.
 */
export function useKeyboardOverlap(enabled: boolean) {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      ref.current?.measureInWindow((_x, y, _width, height) =>
        setOverlap(keyboardOverlap({ y, height }, e.endCoordinates.screenY)),
      );
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
      setOverlap(0);
    };
  }, [enabled]);

  return { ref, overlap };
}
