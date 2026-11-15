import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  AUTO_ADVANCE_DEFAULT,
  AUTO_ADVANCE_STORAGE_KEY,
  parseAutoAdvance,
  serializeAutoAdvance,
} from './guided-session';

/**
 * "Passar sozinho para o próximo exercício", guardado no aparelho. O
 * SecureStore já está no projeto (tema, sessão) e evita dependência nova só
 * para guardar um "0". Falhar ao ler ou gravar não para o treino: vale o
 * padrão, e a escolha dura até o app fechar.
 */
export function useAutoAdvance(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(AUTO_ADVANCE_DEFAULT);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(AUTO_ADVANCE_STORAGE_KEY)
      .then((raw) => {
        if (alive) setOn(parseAutoAdvance(raw));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const set = useCallback((next: boolean) => {
    setOn(next);
    SecureStore.setItemAsync(AUTO_ADVANCE_STORAGE_KEY, serializeAutoAdvance(next)).catch(
      () => undefined,
    );
  }, []);

  return [on, set];
}
