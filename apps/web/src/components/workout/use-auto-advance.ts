'use client';

import { useCallback, useState } from 'react';

const KEY = 'fatia:workout:auto-advance';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * "Passar sozinho para o próximo exercício" (#377): ligado, o fim de um
 * exercício já abre o seguinte; desligado, a sessão pergunta qual vem. Guardado
 * no aparelho: é preferência de quem treina ali, não dado do treino.
 */
export function useAutoAdvance(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(read);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Navegação privada ou armazenamento bloqueado: vale só nesta tela.
    }
  }, []);
  return [on, set];
}
