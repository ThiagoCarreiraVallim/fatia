import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp, Camera, Mic, Square, X } from 'lucide-react-native';
import type { ChatPhoto } from '@fatia/api-client';
import { cn, useActionSheet, useToast } from '@/components/ui';
import { useDictation } from '@/chat/dictation';
import { cores } from '@/theme/cores';

/** O teto do agente por mensagem (`MAX_FOTOS_POR_MENSAGEM`). */
const MAX_FOTOS = 3;
/** O agente recusa acima de 4 000 caracteres; o campo para antes. */
const MAX_CARACTERES = 4000;

/**
 * O campo de mensagem. Foto vai em JPEG recomprimido (`quality: 0.6`) e a API
 * tira o EXIF de novo antes de seguir (ADR 020); o ditado devolve o texto para
 * o campo e não envia nada.
 */
export function Composer({
  running,
  disabled,
  photosEnabled,
  dictationEnabled,
  onSend,
  onStop,
}: {
  running: boolean;
  disabled: boolean;
  photosEnabled: boolean;
  dictationEnabled: boolean;
  onSend: (text: string, photos: ChatPhoto[]) => void;
  onStop: () => void;
}) {
  const toast = useToast();
  const actionSheet = useActionSheet();
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<{ uri: string; data: string }[]>([]);
  const aoDitar = useCallback(
    (ditado: string) => setTexto((t) => (t.trim() ? `${t.trimEnd()} ${ditado}` : ditado)),
    [],
  );
  const ditado = useDictation(aoDitar);

  const podeEnviar = !disabled && !running && (texto.trim().length > 0 || fotos.length > 0);

  const enviar = () => {
    if (!podeEnviar) return;
    onSend(
      texto,
      fotos.map((f) => ({ mediaType: 'image/jpeg', data: f.data })),
    );
    setTexto('');
    setFotos([]);
  };

  const pickPhoto = async (fonte: 'camera' | 'galeria') => {
    const opcoes: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
      exif: false,
    };
    if (fonte === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) {
        toast.show({ message: 'Câmera bloqueada. Libere para o Fatia nos ajustes do sistema.' });
        return;
      }
    }
    const r =
      fonte === 'camera'
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync(opcoes);
    const foto = r.canceled ? undefined : r.assets[0];
    if (foto?.base64)
      setFotos((f) => [...f, { uri: foto.uri, data: foto.base64! }].slice(0, MAX_FOTOS));
  };

  const attachPhoto = () =>
    actionSheet({
      title: 'Anexar foto',
      options: [
        { label: 'Câmera', onPress: () => void pickPhoto('camera') },
        { label: 'Galeria', onPress: () => void pickPhoto('galeria') },
      ],
    });

  return (
    <View className="gap-2 border-t border-border bg-background px-3 pt-2 pb-2">
      {ditado.error ? (
        <Pressable accessibilityRole="alert" onPress={ditado.dismissError}>
          <Text className="text-xs text-muted-foreground">{ditado.error}</Text>
        </Pressable>
      ) : null}
      {fotos.length ? (
        <View className="flex-row gap-2">
          {fotos.map((f, i) => (
            <View key={f.uri} className="relative">
              <Image
                source={{ uri: f.uri }}
                className="h-14 w-14 rounded-lg"
                accessibilityIgnoresInvertColors
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tirar a foto ${i + 1}`}
                onPress={() => setFotos((fs) => fs.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 h-6 w-6 items-center justify-center rounded-full bg-card"
              >
                <X size={12} color={cores.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-end gap-2">
        {photosEnabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Anexar foto"
            disabled={disabled || running || fotos.length >= MAX_FOTOS}
            onPress={attachPhoto}
            className={cn(
              'h-11 w-11 items-center justify-center',
              (disabled || running || fotos.length >= MAX_FOTOS) && 'opacity-40',
            )}
          >
            <Camera size={20} color={cores.mutedForeground} />
          </Pressable>
        ) : null}
        <TextInput
          accessibilityLabel="Mensagem para o Fatia"
          value={texto}
          onChangeText={setTexto}
          editable={!disabled && ditado.state === 'idle'}
          multiline
          maxLength={MAX_CARACTERES}
          placeholder={
            ditado.state === 'recording'
              ? 'Ouvindo… toque no quadrado para parar'
              : ditado.state === 'transcribing'
                ? 'Transcrevendo…'
                : disabled
                  ? 'Abrindo a conversa…'
                  : 'Escreva sua mensagem'
          }
          placeholderTextColor={cores.mutedForeground}
          className="max-h-32 min-h-[44px] flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground"
        />
        {dictationEnabled && !running && !texto.trim() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ditado.state === 'recording' ? 'Parar o ditado' : 'Ditar mensagem'}
            disabled={disabled || ditado.state === 'transcribing'}
            onPress={() => void (ditado.state === 'recording' ? ditado.stop() : ditado.start())}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full',
              ditado.state === 'recording' ? 'bg-destructive' : 'bg-secondary',
            )}
          >
            {ditado.state === 'transcribing' ? (
              <ActivityIndicator size="small" color={cores.primary} />
            ) : ditado.state === 'recording' ? (
              <Square size={16} color={cores.foreground} fill={cores.foreground} />
            ) : (
              <Mic size={20} color={cores.foreground} />
            )}
          </Pressable>
        ) : running ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Parar resposta"
            onPress={onStop}
            className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Square size={16} color={cores.foreground} fill={cores.foreground} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            disabled={!podeEnviar}
            onPress={enviar}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full bg-primary',
              !podeEnviar && 'opacity-40',
            )}
          >
            <ArrowUp size={20} color={cores.primaryForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
