import { Linking } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { usersApi } from '@fatia/api-client';
import { useToast } from '@/components/ui/toast';

export const EXPORT_READY_TOAST = 'Arquivo pronto · baixe pelo link (vale 24 h)';

/**
 * "Exportar meus dados" (prancha Al-V1): a API devolve um link que vale 24 h e
 * abre sem login. O link vai para o navegador do sistema, que baixa o arquivo
 * — nada de dado de saúde em claro parado no cache do app. O aviso deixa o
 * link à mão para abrir de novo.
 */
export function useExportData() {
  const toast = useToast();
  return useMutation({
    mutationFn: () => usersApi.exportMyData(),
    onSuccess: ({ url }) => {
      void Linking.openURL(url);
      toast.show({
        message: EXPORT_READY_TOAST,
        action: { label: 'Baixar', onPress: () => void Linking.openURL(url) },
      });
    },
    onError: () => toast.show({ message: 'Não deu para preparar o arquivo. Tente de novo.' }),
  });
}
