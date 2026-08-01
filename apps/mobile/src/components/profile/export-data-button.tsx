import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Download } from 'lucide-react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { usersApi } from '@fatia/api-client';
import { Button, FormMessage } from '@/components/ui';

/**
 * Portabilidade (LGPD art. 18, V) pelo app.
 *
 * No navegador o export vira download. No celular não existe pasta de downloads
 * a que a pessoa chegue sozinha, então o JSON sai pela folha de compartilhamento
 * do sistema — de onde ela escolhe salvar em Arquivos/Drive, mandar por e-mail
 * ou abrir em outro app.
 *
 * Vai como **arquivo**, não como texto no corpo da mensagem: o export de uma
 * conta com histórico é grande, e vários destinos truncam texto longo em
 * silêncio. Export truncado é pior que export que falhou, porque parece ter
 * funcionado.
 *
 * O arquivo é escrito no cache justamente por ser descartável — o sistema o
 * remove sozinho quando precisar de espaço, e apagamos logo depois: dado de
 * saúde em claro não fica parado no aparelho depois que a pessoa já o guardou
 * onde queria.
 */
export function ExportDataButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setPending(true);
    let arquivo: File | null = null;
    try {
      const data = await usersApi.exportMyData();
      const carimbo = new Date().toISOString().slice(0, 10);

      arquivo = new File(Paths.cache, `fatia-meus-dados-${carimbo}.json`);
      if (arquivo.exists) arquivo.delete();
      arquivo.create();
      arquivo.write(JSON.stringify(data, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(arquivo.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Meus dados do Fatia',
          UTI: 'public.json',
        });
      } else {
        // Emulador sem app de compartilhamento instalado. Entregar o conteúdo de
        // algum jeito é melhor do que dizer que falhou.
        await Share.share({
          title: 'Meus dados do Fatia',
          message: JSON.stringify(data, null, 2),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível exportar seus dados.');
    } finally {
      try {
        if (arquivo?.exists) arquivo.delete();
      } catch {
        // Cache é descartável por definição — falhar a limpeza não é erro a
        // mostrar para quem só queria exportar os dados.
      }
      setPending(false);
    }
  }

  return (
    <View className="gap-2">
      <Button
        variant="outline"
        className="w-full"
        loading={pending}
        onPress={() => void handleExport()}
        accessibilityLabel="Exportar meus dados"
        accessibilityHint="Abre o menu de compartilhamento do sistema com seus dados em JSON"
      >
        <Download size={16} color="#e5e2e1" />
        <Text className="text-sm font-medium text-foreground">
          {pending ? 'Preparando…' : 'Exportar meus dados'}
        </Text>
      </Button>
      <FormMessage>{error}</FormMessage>
    </View>
  );
}
