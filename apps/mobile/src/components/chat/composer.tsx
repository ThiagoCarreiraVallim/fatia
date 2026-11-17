import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp, Camera, ListPlus, Mic, Square, X } from 'lucide-react-native';
import type { LocalChatPhoto, QueuedChatMessage } from '@/chat/chat-session';
import { cn, useActionSheet, useToast } from '@/components/ui';
import { useDictation } from '@/chat/dictation';
import { colors } from '@/theme/colors';

/** O teto do agente por mensagem (`MAX_FOTOS_POR_MENSAGEM`). */
const MAX_FOTOS = 3;
/** O agente recusa acima de 4 000 caracteres; o campo para antes. */
const MAX_CARACTERES = 4000;

/**
 * O campo de mensagem. Foto vai em JPEG recomprimido (`quality: 0.6`), sem EXIF,
 * e é guardada no bucket (ADR 046); a API a reprocessa no `confirm` (reduz a
 * 1280 px e tira metadado de novo). O ditado devolve o texto para o campo e não
 * envia nada.
 *
 * Com a resposta correndo, o texto vai para a fila (`onQueue`) e sai sozinho
 * quando a conversa fica livre. Foto não entra na fila: ela sobe para o bucket
 * na hora do envio, e guardada aqui ficaria presa ao app aberto.
 */
export function Composer({
  running,
  disabled,
  photosEnabled,
  dictationEnabled,
  queue,
  quote,
  onDismissQuote,
  onSend,
  onQueue,
  onDequeue,
  onStop,
}: {
  running: boolean;
  disabled: boolean;
  photosEnabled: boolean;
  dictationEnabled: boolean;
  queue: QueuedChatMessage[];
  /** O trecho citado, que vai na frente da próxima mensagem (`ChatSession.setQuote`). */
  quote: string | null;
  onDismissQuote: () => void;
  onSend: (text: string, photos: LocalChatPhoto[]) => void;
  onQueue: (text: string) => void;
  onDequeue: (id: string) => void;
  onStop: () => void;
}) {
  const toast = useToast();
  const actionSheet = useActionSheet();
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<LocalChatPhoto[]>([]);
  const aoDitar = useCallback(
    (ditado: string) => setTexto((t) => (t.trim() ? `${t.trimEnd()} ${ditado}` : ditado)),
    [],
  );
  const ditado = useDictation(aoDitar);

  const podeEnviar = !disabled && !running && (texto.trim().length > 0 || fotos.length > 0);

  const podeEnfileirar = !disabled && running && texto.trim().length > 0 && fotos.length === 0;

  const enfileirar = () => {
    if (!podeEnfileirar) return;
    onQueue(texto);
    setTexto('');
  };

  const enviar = () => {
    if (!podeEnviar) return;
    onSend(texto, fotos);
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
      {ditado.state === 'recording' ? (
        // Prancha Al-M17: quem fala precisa saber que a voz não fica guardada.
        <Text
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          <Text className="text-xs font-semibold text-danger">Ouvindo…</Text> O áudio vira texto e é
          descartado.
        </Text>
      ) : null}
      {ditado.error ? (
        <Pressable accessibilityRole="alert" onPress={ditado.dismissError}>
          <Text className="text-xs text-muted-foreground">{ditado.error}</Text>
        </Pressable>
      ) : null}
      {queue.length ? (
        <View className="gap-1" accessibilityLabel="Mensagens na fila">
          {queue.map((item, i) => (
            <View
              key={item.id}
              className="flex-row items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5"
            >
              <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                {item.text}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tirar da fila a mensagem ${i + 1}`}
                hitSlop={8}
                onPress={() => onDequeue(item.id)}
              >
                <X size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {quote ? (
        <View className="flex-row items-start gap-2">
          <Text
            numberOfLines={3}
            accessibilityLabel={`Trecho citado: ${quote}`}
            className="flex-1 border-l-2 border-primary pl-2.5 text-xs text-muted-foreground"
          >
            {quote}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tirar a citação"
            hitSlop={8}
            onPress={onDismissQuote}
          >
            <X size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
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
                <X size={12} color={colors.foreground} />
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
            <Camera size={20} color={colors.mutedForeground} />
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
          placeholderTextColor={colors.mutedForeground}
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
              <ActivityIndicator size="small" color={colors.primaryText} />
            ) : ditado.state === 'recording' ? (
              <Square size={16} color={colors.foreground} fill={colors.foreground} />
            ) : (
              <Mic size={20} color={colors.foreground} />
            )}
          </Pressable>
        ) : running ? (
          <View className="flex-row gap-2">
            {podeEnfileirar ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pôr na fila"
                onPress={enfileirar}
                className="h-11 w-11 items-center justify-center rounded-full bg-primary"
              >
                <ListPlus size={20} color={colors.primaryForeground} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Parar resposta"
              onPress={onStop}
              className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
            >
              <Square size={16} color={colors.foreground} fill={colors.foreground} />
            </Pressable>
          </View>
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
            <ArrowUp size={20} color={colors.primaryForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
