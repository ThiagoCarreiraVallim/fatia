import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp, Camera, ListPlus, Mic, Square, X } from 'lucide-react-native';
import type { LocalChatPhoto, QueuedChatMessage } from '@/chat/chat-session';
import { cn, useToast } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useDictation } from '@/chat/dictation';
import { AI_CONSENT_KEY } from '@/chat/ai-consent';
import { colors } from '@/theme/colors';

/** O teto do agente por mensagem (`MAX_FOTOS_POR_MENSAGEM`). */
const MAX_FOTOS = 3;
/** O agente recusa acima de 4 000 caracteres; o campo para antes. */
const MAX_CARACTERES = 4000;

/**
 * O campo de mensagem. A câmera manda a foto para a conversa num passo (#482): tocar abre a
 * câmera e a foto sai na hora, com o que estiver escrito no campo; segurar abre a galeria (até
 * três). Foto vai em JPEG recomprimido (`quality: 0.6`), sem EXIF, e é guardada no bucket
 * (ADR 046); a API a reprocessa no `confirm` (reduz a 1280 px e tira metadado de novo). O ditado
 * devolve o texto para o campo e não envia nada.
 *
 * Com a resposta correndo, o texto vai para a fila (`onQueue`) e sai sozinho
 * quando a conversa fica livre. Foto não entra na fila (a câmera fica apagada): ela sobe para o
 * bucket na hora do envio, e guardada aqui ficaria presa ao app aberto.
 */
export function Composer({
  running,
  disabled,
  photosEnabled,
  dictationEnabled,
  queue,
  queuePaused = false,
  onSendQueued,
  quote,
  onDismissQuote,
  onSend,
  onQueue,
  onDequeue,
  onStop,
  blockedPlaceholder,
}: {
  running: boolean;
  disabled: boolean;
  /** O campo travado por um motivo que a pessoa precisa ler ("Volta amanhã", Al-M11). */
  blockedPlaceholder?: string;
  photosEnabled: boolean;
  dictationEnabled: boolean;
  queue: QueuedChatMessage[];
  /** A última resposta falhou: nada sai sozinho; cada item tem "Enviar" e "Descartar". */
  queuePaused?: boolean;
  onSendQueued?: (id: string) => void;
  /** O trecho citado, que vai na frente da próxima mensagem (`ChatSession.setQuote`). */
  quote: string | null;
  onDismissQuote: () => void;
  onSend: (text: string, photos: LocalChatPhoto[]) => void;
  onQueue: (text: string) => void;
  onDequeue: (id: string) => void;
  onStop: () => void;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const aoDitar = useCallback(
    (ditado: string) => setTexto((t) => (t.trim() ? `${t.trimEnd()} ${ditado}` : ditado)),
    [],
  );
  const queryClient = useQueryClient();
  // O aceite caiu (403): relê os aceites e o cartão do aceite volta no lugar do campo.
  const semAceite = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: AI_CONSENT_KEY }),
    [queryClient],
  );
  const ditado = useDictation(aoDitar, semAceite);

  const podeEnviar = !disabled && !running && texto.trim().length > 0;
  const podeFoto = !disabled && !running;

  const podeEnfileirar = !disabled && running && texto.trim().length > 0;

  const enfileirar = () => {
    if (!podeEnfileirar) return;
    onQueue(texto);
    setTexto('');
  };

  const send = (fotos: LocalChatPhoto[] = []) => {
    if (fotos.length ? !podeFoto : !podeEnviar) return;
    onSend(texto, fotos);
    setTexto('');
  };

  const sendPhoto = async (fonte: 'camera' | 'galeria') => {
    const opcoes: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
      exif: false,
      ...(fonte === 'galeria' ? { allowsMultipleSelection: true, selectionLimit: MAX_FOTOS } : {}),
    };
    if (fonte === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) {
        toast.show({
          message: 'Câmera bloqueada. Libere nos ajustes, ou segure o botão para usar a galeria.',
        });
        return;
      }
    }
    const r =
      fonte === 'camera'
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (r.canceled) return;
    const fotos = r.assets
      .filter((a) => a.base64)
      .slice(0, MAX_FOTOS)
      .map((a) => ({ uri: a.uri, data: a.base64! }));
    if (fotos.length) send(fotos);
  };

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
          {queuePaused ? (
            <Text className="text-xs text-muted-foreground">
              A resposta anterior falhou. Estas ficaram esperando você:
            </Text>
          ) : null}
          {queue.map((item, i) => (
            <View
              key={item.id}
              className="flex-row items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5"
            >
              <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                {item.text}
              </Text>
              {queuePaused ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar a mensagem ${i + 1}`}
                    disabled={running}
                    hitSlop={8}
                    onPress={() => onSendQueued?.(item.id)}
                  >
                    <Text className="text-xs font-semibold text-primary-text">Enviar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Descartar a mensagem ${i + 1}`}
                    hitSlop={8}
                    onPress={() => onDequeue(item.id)}
                  >
                    <Text className="text-xs text-muted-foreground">Descartar</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tirar da fila a mensagem ${i + 1}`}
                  hitSlop={8}
                  onPress={() => onDequeue(item.id)}
                >
                  <X size={14} color={colors.mutedForeground} />
                </Pressable>
              )}
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
      <View className="flex-row items-end gap-2">
        {/* A câmera fica dentro do campo, com a borda verde (prancha Al-M20). */}
        <View className="min-h-11 flex-1 flex-row items-end rounded-3xl border border-primary/35 bg-card">
          {photosEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tirar foto e mandar"
              accessibilityHint="Segure para escolher da galeria"
              accessibilityActions={[{ name: 'longpress', label: 'Escolher da galeria' }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'longpress') void sendPhoto('galeria');
              }}
              disabled={!podeFoto}
              onPress={() => void sendPhoto('camera')}
              onLongPress={() => void sendPhoto('galeria')}
              className={cn(
                'h-11 w-10 items-center justify-center pl-1',
                !podeFoto && 'opacity-40',
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
                  : blockedPlaceholder
                    ? blockedPlaceholder
                    : disabled
                      ? 'Abrindo a conversa…'
                      : 'Responda ou peça outra coisa'
            }
            placeholderTextColor={colors.mutedForeground}
            className={cn(
              'max-h-32 min-h-[44px] flex-1 py-2.5 pr-4 text-[15px] text-foreground',
              !photosEnabled && 'pl-4',
            )}
          />
        </View>
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
            onPress={() => send()}
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
