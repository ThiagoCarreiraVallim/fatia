'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usersApi } from '@fatia/api-client';

export const EXPORT_READY_TOAST = 'Arquivo pronto · baixe pelo link (vale 24 h)';

/**
 * "Exportar meus dados" (prancha Al-V1): a API devolve um link que vale 24 h e
 * abre sem login. O navegador baixa na hora (o arquivo vem como anexo, então a
 * página não muda), e o aviso deixa o link à mão para baixar de novo.
 */
export function useExportData() {
  return useMutation({
    mutationFn: () => usersApi.exportMyData(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
      toast(EXPORT_READY_TOAST, {
        action: { label: 'Baixar', onClick: () => window.location.assign(url) },
      });
    },
    onError: () => toast('Não deu para preparar o arquivo. Tente de novo.'),
  });
}
