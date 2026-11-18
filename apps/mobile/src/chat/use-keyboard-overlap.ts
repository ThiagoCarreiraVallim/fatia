import { useEffect, useRef, useState } from 'react';
import { Keyboard, type View } from 'react-native';
import { keyboardOverlap } from './keyboard-overlap';

/**
 * O quanto o teclado cobre a `View` do `ref`, para virar `paddingBottom` dela. Só com
 * `Keyboard` e `measure`, sem módulo nativo (roda no Expo Go). No Android só há os
 * eventos `Did`; abrir as sugestões ou trocar de teclado dispara outro `keyboardDidShow`.
 */
export function useKeyboardOverlap(enabled: boolean) {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      // `measure`, e não `measureInWindow`: no Android este desconta a barra de status, e o
      // campo ficava atrás do teclado por essa altura; o `pageY` é da raiz, como o `screenY`.
      ref.current?.measure((_x, _y, _width, height, _pageX, pageY) =>
        setOverlap(keyboardOverlap({ y: pageY, height }, e.endCoordinates.screenY)),
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
