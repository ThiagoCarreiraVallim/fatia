import { useState } from 'react';
import { Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { ApiError, formatBytes, uploadMedia } from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { describePickedVideo } from './picked-image';

export interface VideoValue {
  fileId: string;
  url: string | null;
}

/**
 * O vídeo do tutorial, da galeria do aparelho direto ao bucket (ADR 028) —
 * equivalente de `apps/web/src/components/content/video-field.tsx`.
 *
 * O envio lê do disco (`createUploadTask`), não da memória: um `Blob` de
 * 150 MB derruba o app em aparelho modesto. Gravar pela câmera do Fatia
 * exigiria a permissão de microfone e um build nativo novo; quem grava usa a
 * câmera do celular e escolhe aqui.
 */
export function VideoField({
  groupId,
  value,
  onChange,
}: {
  groupId: string;
  value: VideoValue | null;
  onChange: (next: VideoValue | null) => void;
}) {
  const toast = useToast();
  const [progresso, setProgresso] = useState<number | null>(null);

  async function escolher() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    const info = describePickedVideo(asset, asset.fileSize ?? new File(asset.uri).size);
    if ('problem' in info) {
      toast.show({ message: info.problem });
      return;
    }
    toast.show({ message: `Enviando ${formatBytes(info.bytes)}. Deixe o app aberto.` });
    setProgresso(0);
    try {
      const view = await uploadMedia(
        { purpose: 'exercise_video', groupId, ...info },
        async (url, headers) => {
          const tarefa = createUploadTask(
            url,
            asset.uri,
            { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers },
            (p) =>
              setProgresso(
                p.totalBytesExpectedToSend > 0 ? p.totalBytesSent / p.totalBytesExpectedToSend : 0,
              ),
          );
          const res = await tarefa.uploadAsync();
          const status = res?.status ?? 0;
          return { ok: status >= 200 && status < 300, status };
        },
      );
      onChange({ fileId: view.id, url: view.url });
    } catch (err) {
      toast.show({
        message:
          err instanceof ApiError && err.status === 503
            ? 'O envio de vídeos não está disponível agora.'
            : err instanceof ApiError && err.status === 400 && err.message
              ? err.message
              : 'Não deu para enviar o vídeo. Tente de novo.',
      });
    } finally {
      setProgresso(null);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-xs text-muted-foreground">Vídeo</Text>
      {progresso !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Enviando o vídeo"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progresso * 100) }}
          className="gap-1"
        >
          <View className="h-2 overflow-hidden rounded-full bg-muted">
            <View className="h-full bg-primary" style={{ width: `${progresso * 100}%` }} />
          </View>
          <Text className="text-xs text-muted-foreground">
            {`Enviando… ${Math.round(progresso * 100)}%`}
          </Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {value?.url ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => void WebBrowser.openBrowserAsync(value.url!)}
            >
              Assistir
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onPress={() => void escolher()}>
            {value ? 'Trocar vídeo' : 'Escolher vídeo'}
          </Button>
          {value ? (
            <Button size="sm" variant="ghost" onPress={() => onChange(null)}>
              Tirar vídeo
            </Button>
          ) : null}
        </View>
      )}
      <Text className="text-xs text-muted-foreground">
        MP4 ou MOV até 200 MB, da galeria. Prefira trechos curtos.
      </Text>
    </View>
  );
}
