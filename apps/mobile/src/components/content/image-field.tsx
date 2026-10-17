import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ApiError, uploadMedia, type MediaPurpose } from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { describePickedImage } from './picked-image';

export interface ImageValue {
  fileId: string;
  url: string | null;
}

/**
 * Escolher uma imagem da galeria e enviar direto ao bucket (ADR 028) —
 * equivalente de `apps/web/src/components/content/image-field.tsx`. O seletor
 * reencoda em JPEG (`quality`), o que também resolve o HEIC do iPhone.
 */
export function ImageField({
  groupId,
  purpose = 'group_content',
  label,
  value,
  onChange,
  square = false,
}: {
  groupId: string;
  purpose?: MediaPurpose;
  label: string;
  value: ImageValue | null;
  onChange: (next: ImageValue | null) => void;
  square?: boolean;
}) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);

  async function escolher() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: square,
      aspect: square ? [1, 1] : undefined,
      exif: false,
    });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    setEnviando(true);
    try {
      const corpo = await (await fetch(asset.uri)).blob();
      const info = describePickedImage(asset, corpo.size);
      if ('problem' in info) {
        toast.show({ message: info.problem });
        return;
      }
      const view = await uploadMedia({ purpose, groupId, ...info }, (url, headers) =>
        fetch(url, { method: 'PUT', body: corpo, headers }),
      );
      onChange({ fileId: view.id, url: view.url });
    } catch (err) {
      toast.show({
        message:
          err instanceof ApiError && err.status === 503
            ? 'O envio de imagens não está disponível agora.'
            : 'Não deu para enviar a imagem. Tente de novo.',
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      {value?.url ? (
        <Image
          source={{ uri: value.url }}
          accessibilityIgnoresInvertColors
          className={square ? 'h-24 w-24 rounded-xl' : 'aspect-video w-full rounded-xl'}
        />
      ) : null}
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" loading={enviando} onPress={() => void escolher()}>
          {value?.url ? 'Trocar imagem' : 'Escolher imagem'}
        </Button>
        {value?.url ? (
          <Button size="sm" variant="ghost" onPress={() => onChange(null)}>
            Tirar imagem
          </Button>
        ) : null}
      </View>
    </View>
  );
}
