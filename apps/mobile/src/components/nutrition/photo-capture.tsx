import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Images } from 'lucide-react-native';
import { Button } from '@/components/ui';

/**
 * Captura da foto da refeição (#139) — câmera e galeria.
 *
 * O componente **não sabe reconhecer nada**: ele entrega o JPEG em base64 e a
 * tela decide o que fazer, do mesmo jeito que `barcode-camera.tsx` só entrega o
 * código lido.
 *
 * **A foto é reduzida e recomprimida antes de sair.** `quality: 0.6` e o corte de
 * resolução do próprio `expo-camera` deixam o arquivo em algumas centenas de kB;
 * a original de um celular moderno passa de 4 MB, e o teto da API é esse. Isso é
 * economia de banda e de tempo de inferência — **não** é a garantia de
 * privacidade: quem remove o EXIF é a API, onde a garantia não depende da versão
 * do app instalada (ver `apps/api/src/nutrition/helpers/strip-exif.ts`).
 */

/** Lado maior da imagem enviada. Modelo de visão não ganha nada acima disso. */
const LARGURA_ALVO = 1024;

interface Props {
  /** JPEG em base64, sem o prefixo `data:`. */
  onCapturada: (jpegBase64: string) => void;
  /** Desligar enquanto o resultado está aberto evita disparar de novo. */
  ativo: boolean;
}

export function PhotoCapture({ onCapturada, ativo }: Props) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [capturando, setCapturando] = useState(false);
  const camera = useRef<CameraView>(null);

  const fotografar = async () => {
    if (!camera.current || capturando) return;
    setCapturando(true);
    try {
      const foto = await camera.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        imageType: 'jpg',
        // `exif: false` só diz que não queremos o EXIF **de volta** no objeto —
        // não promete que o arquivo saia sem ele. Pedimos assim mesmo por
        // higiene; a remoção de verdade é na API.
        exif: false,
      });
      if (foto?.base64) onCapturada(foto.base64);
    } finally {
      setCapturando(false);
    }
  };

  const escolherDaGaleria = async () => {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
      // O Expo reencoda para JPEG ao aplicar `quality`, o que também resolve o
      // HEIC do iPhone — formato que os endpoints de visão não aceitam.
      allowsEditing: false,
      exif: false,
    });
    const escolhida = resultado.assets?.[0];
    if (!resultado.canceled && escolhida?.base64) onCapturada(escolhida.base64);
  };

  if (!permissao) {
    return <Aviso texto="Preparando a câmera…" />;
  }

  if (!permissao.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <Text className="text-center text-base font-medium text-foreground">
          O registro por foto precisa da câmera
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          A foto é analisada e descartada: ela não é salva no Fatia nem aparece no seu histórico.
          Você revisa o que a IA entendeu antes de qualquer coisa ser registrada.
        </Text>
        {permissao.canAskAgain ? (
          <Button onPress={() => void pedirPermissao()}>Permitir câmera</Button>
        ) : (
          <Text className="text-center text-sm text-muted-foreground">
            A permissão foi negada. Libere a câmera para o Fatia nos ajustes do aparelho.
          </Text>
        )}
        <Button variant="outline" onPress={() => void escolherDaGaleria()}>
          Escolher da galeria
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" pictureSize={`${LARGURA_ALVO}`} />

      <View className="absolute inset-x-0 bottom-0 flex-row items-center justify-center gap-6 pb-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escolher foto da galeria"
          onPress={() => void escolherDaGaleria()}
          disabled={!ativo || capturando}
          className="h-12 w-12 items-center justify-center rounded-full bg-background/80 active:bg-accent"
        >
          <Images size={20} color="#baccaf" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fotografar o prato"
          onPress={() => void fotografar()}
          disabled={!ativo || capturando}
          // 72 px e não 44: é o alvo principal da tela e a pessoa está segurando
          // o aparelho com uma mão só, apontando para o prato com a outra.
          className="h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 bg-white/20 active:bg-white/40"
        >
          <View className="h-14 w-14 rounded-full bg-white/90" />
        </Pressable>

        {/* Espaçador com a largura do botão da galeria, para o disparador ficar
            centralizado na tela e não deslocado para a direita. */}
        <View className="h-12 w-12" />
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
