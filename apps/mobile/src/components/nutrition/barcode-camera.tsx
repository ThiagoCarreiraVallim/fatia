import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '@/components/ui';
import { TIPOS_DE_CODIGO } from './barcode';

/**
 * Câmera lendo código de barras.
 *
 * É `expo-camera`, não `expo-barcode-scanner`: o pacote antigo foi
 * descontinuado e no SDK 57 a leitura vive no `CameraView`.
 *
 * O componente não sabe consultar nada — só entrega o código lido. Quem decide
 * o que fazer com ele é a tela, e a trava contra leitura repetida está em
 * `podeProcessarLeitura`, que é testável sem montar React Native.
 */
export function BarcodeCamera({
  onLido,
  ativo,
}: {
  onLido: (codigo: string) => void;
  /** Desligar enquanto o resultado está aberto evita ler o produto seguinte. */
  ativo: boolean;
}) {
  const [permissao, pedirPermissao] = useCameraPermissions();

  if (!permissao) {
    return <Aviso texto="Preparando a câmera…" />;
  }

  if (!permissao.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <Text className="text-center text-base font-medium text-foreground">
          O scanner precisa da câmera
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          A imagem não sai do aparelho e nada é gravado. Só o número do código de barras é
          consultado.
        </Text>
        {permissao.canAskAgain ? (
          <Button onPress={() => void pedirPermissao()}>Permitir câmera</Button>
        ) : (
          <Text className="text-center text-sm text-muted-foreground">
            A permissão foi negada. Libere a câmera para o Fatia nos ajustes do aparelho.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...TIPOS_DE_CODIGO] }}
        // `undefined` desliga a leitura de fato; passar uma função vazia mantém
        // o processamento de cada quadro rodando à toa e esquenta o aparelho.
        onBarcodeScanned={ativo ? ({ data }) => onLido(data) : undefined}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-40 w-72 rounded-lg border-2 border-primary/80" />
      </View>
    </View>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-sm text-muted-foreground">{texto}</Text>
    </View>
  );
}
