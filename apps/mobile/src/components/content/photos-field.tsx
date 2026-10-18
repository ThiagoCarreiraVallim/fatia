import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X } from 'lucide-react-native';
import { ApiError, MAX_GUIDE_PHOTOS, uploadMedia } from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';
import type { ImageValue } from './image-field';
import { describePickedImage } from './picked-image';

/**
 * Até quatro fotos do tutorial — equivalente de
 * `apps/web/src/components/content/photos-field.tsx`.
 */
export function PhotosField({
  groupId,
  value,
  onChange,
}: {
  groupId: string;
  value: ImageValue[];
  onChange: (next: ImageValue[]) => void;
}) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const vagas = MAX_GUIDE_PHOTOS - value.length;

  async function escolher() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: vagas,
      exif: false,
    });
    if (r.canceled || !r.assets?.length) return;
    setEnviando(true);
    const novas: ImageValue[] = [];
    try {
      for (const asset of r.assets.slice(0, vagas)) {
        const corpo = await (await fetch(asset.uri)).blob();
        const info = describePickedImage(asset, corpo.size);
        if ('problem' in info) {
          toast.show({ message: info.problem });
          continue;
        }
        const view = await uploadMedia({ purpose: 'exercise_photo', groupId, ...info }, (url, h) =>
          fetch(url, { method: 'PUT', body: corpo, headers: h }),
        );
        novas.push({ fileId: view.id, url: view.url });
      }
    } catch (err) {
      toast.show({
        message:
          err instanceof ApiError && err.status === 503
            ? 'O envio de imagens não está disponível agora.'
            : 'Não deu para enviar a foto. Tente de novo.',
      });
    } finally {
      if (novas.length) onChange([...value, ...novas]);
      setEnviando(false);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-xs text-muted-foreground">{`Fotos (até ${MAX_GUIDE_PHOTOS})`}</Text>
      {value.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {value.map((f, i) => (
            <View key={f.fileId} className="relative">
              <Image
                source={{ uri: f.url ?? undefined }}
                accessibilityLabel={`Foto ${i + 1}`}
                accessibilityIgnoresInvertColors
                className="h-20 w-20 rounded-xl"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tirar a foto ${i + 1}`}
                hitSlop={8}
                onPress={() => onChange(value.filter((x) => x.fileId !== f.fileId))}
                className="absolute right-1 top-1 rounded-full bg-background p-1"
              >
                <X size={12} color={cores.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {vagas > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          loading={enviando}
          onPress={() => void escolher()}
        >
          Adicionar fotos
        </Button>
      ) : null}
    </View>
  );
}
