import { useCallback, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { FileSystemUploadType, deleteAsync, uploadAsync } from 'expo-file-system/legacy';
import { useAuth } from '@/auth/auth-context';
import { env } from '@/env';

/**
 * O ditado do chat no app (Fase 9e): grava, manda o áudio ao `/chat/transcribe`
 * e devolve o texto para o campo. **Não envia mensagem**: quem decide mandar é a
 * pessoa, depois de ler — como na web (#141).
 *
 * O áudio vai cru no corpo (`audio/mp4`, o AAC do preset) e o arquivo é apagado
 * do aparelho em seguida: nada dele fica guardado (ADR 020).
 */

export type DictationState = 'idle' | 'recording' | 'transcribing';

/** Ditado é curto; dois minutos já passam do que se fala para um campo de mensagem. */
const MAX_MS = 120_000;

export function useDictation(onText: (texto: string) => void) {
  const { getAccessToken } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(async () => {
    if (limite.current) clearTimeout(limite.current);
    limite.current = null;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri) {
      setState('idle');
      return;
    }
    setState('transcribing');
    try {
      const token = await getAccessToken();
      const resposta = await uploadAsync(`${env.apiUrl}/api/chat/transcribe`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': 'audio/mp4',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (resposta.status >= 400) {
        setError(
          resposta.status === 402
            ? 'O ditado faz parte do plano PRO.'
            : 'Não deu para transcrever agora. Tente de novo ou digite.',
        );
      } else {
        const corpo = JSON.parse(resposta.body) as { text?: unknown };
        if (typeof corpo.text === 'string' && corpo.text.trim()) onText(corpo.text.trim());
      }
    } catch {
      setError('Não deu para transcrever agora. Tente de novo ou digite.');
    } finally {
      await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      setState('idle');
    }
  }, [getAccessToken, onText, recorder]);

  const start = useCallback(async () => {
    setError(null);
    const permissao = await requestRecordingPermissionsAsync();
    if (!permissao.granted) {
      setError('O Fatia precisa do microfone para o ditado. Libere nas configurações do sistema.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
    limite.current = setTimeout(() => void stop(), MAX_MS);
  }, [recorder, stop]);

  return { state, error, start, stop, dismissError: () => setError(null) };
}
