'use client';

import { useEffect, useState } from 'react';
import { UNDO_MS } from '@fatia/api-client';

/**
 * O último registro apagado, guardado por `UNDO_MS` para o "Desfazer".
 *
 * Dentro de um drawer o aviso não pode ser o `toast` do `sonner`: o drawer é
 * modal e deixa o resto da página inerte, e o botão do aviso não recebe toque.
 * Por isso o "Desfazer" dos registros pequenos mora na própria lista
 * (`LogHistory`), e este hook só cuida do prazo.
 */
export function useUndoSlot<T>() {
  const [item, setItem] = useState<T | null>(null);
  useEffect(() => {
    if (item === null) return;
    const timer = setTimeout(() => setItem(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [item]);
  return [item, setItem] as const;
}
