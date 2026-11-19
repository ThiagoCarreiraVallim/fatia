import { useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  CHECKIN_CAPTION_MAX,
  challengesApi,
  IMAGE_MAX_BYTES,
  mediaApi,
  type ChallengeDetail,
  type CheckinEligibility,
  type MediaPurpose,
} from '@fatia/api-client';
import {
  checkinButtonLabel,
  checkinHint,
  checkinReducer,
  checkinStamp,
  checkinTag,
  doneSummary,
  workoutMeta,
  workoutSpan,
  workoutTitle,
  checkinPhotoBytes,
  checkinPhotoPreview,
  type CapturedPhoto,
  type Tone,
} from '@/components/challenges/challenge-view';
import { challengeKey, challengeListKey } from '@/components/challenges/join-challenge-drawer';
import { apiMessage } from '@/components/org/org-panel';
import { Button, Icon, Input, cn } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * A foto de check-in vai ao bucket com este propósito; a API confirma,
 * reencoda, tira o EXIF e carimba a hora do servidor ao receber o check-in.
 */
const CHECKIN_PURPOSE: MediaPurpose = 'challenge_checkin';

const TAG_VARIANT: Record<Tone, 'done' | 'lite' | 'risk'> = {
  ok: 'done',
  warn: 'lite',
  bad: 'risk',
};

/** Pede a URL, manda o JPEG direto ao bucket e devolve o id do arquivo. */
async function uploadCheckinPhoto(groupId: string, photo: CapturedPhoto): Promise<string> {
  const body = checkinPhotoBytes(photo);
  if (body.byteLength <= 0) throw new Error('A foto saiu vazia. Tire outra.');
  if (body.byteLength > IMAGE_MAX_BYTES) throw new Error('A foto ficou grande demais. Tire outra.');
  const ticket = await mediaApi.requestUpload({
    purpose: CHECKIN_PURPOSE,
    groupId,
    mime: 'image/jpeg',
    bytes: body.byteLength,
  });
  const put = await fetch(ticket.uploadUrl, { method: 'PUT', body, headers: ticket.headers });
  if (!put.ok) throw new Error('O envio da foto falhou. Tente de novo.');
  return ticket.fileId;
}

function sendError(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) {
    return 'O envio de fotos não está disponível agora. Tente mais tarde.';
  }
  if (err instanceof ApiError) return apiMessage(err, 'Não deu para fazer o check-in agora.');
  if (err instanceof Error && err.message) return err.message;
  return 'Não deu para fazer o check-in agora.';
}

/** O cartão do treino sobre a câmera (Cm-18). */
function WorkoutCard({ e }: { e: CheckinEligibility | undefined }) {
  const tag = e ? checkinTag(e) : null;
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-black/60 px-3.5 py-3">
      <Icon name="dumbbell" size={22} color="#fff" />
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-sm text-white">
          {e ? workoutTitle(e) : 'Conferindo seu treino…'}
        </Text>
        {e ? <Text className="text-xs text-white/80">{workoutMeta(e)}</Text> : null}
      </View>
      {tag ? <Badge variant={TAG_VARIANT[tag.tone]}>{tag.label}</Badge> : null}
    </View>
  );
}

/** Sem câmera (permissão negada, módulo ausente ou erro): explica, sem galeria. */
function NoCamera({
  canAsk,
  onAsk,
  failed,
}: {
  canAsk: boolean;
  onAsk: () => void;
  failed: boolean;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <Icon name="camera" size={32} color="#fff" />
      <Text className="text-center font-sans-bold text-base text-white">
        O check-in precisa da câmera do app
      </Text>
      <Text className="text-center text-sm text-white/75">
        {failed
          ? 'A câmera não abriu neste aparelho. Feche e tente de novo; se continuar, atualize o app.'
          : 'A foto é tirada na hora, como prova do treino. A galeria fica fechada: foto antiga não vale.'}
      </Text>
      {failed ? null : canAsk ? (
        <Button onPress={onAsk}>Permitir câmera</Button>
      ) : (
        <Text className="text-center text-sm text-white/75">
          A permissão foi negada. Libere a câmera para o Fatia nos ajustes do aparelho.
        </Text>
      )}
    </View>
  );
}

/**
 * Check-in com foto (Cm-18): a câmera do app (sem galeria), o treino ligado,
 * a revisão com legenda e o "Check-in feito". A tela é cheia, num `Modal`,
 * para a barra de baixo e o botão da IA nunca ficarem sobre o disparador.
 * Sem "postar no mural": a foto é prova e só a pessoa e a equipe veem (ADR 044).
 */
export default function ChallengeCheckinScreen() {
  const { groupId, challengeId } = useLocalSearchParams<{
    groupId: string;
    challengeId: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [caption, setCaption] = useState('');
  const [state, dispatch] = useReducer(checkinReducer, { step: 'camera' });
  const camera = useRef<CameraView>(null);

  const detail = useQuery({
    queryKey: challengeKey(groupId, challengeId),
    queryFn: () => challengesApi.get(groupId, challengeId),
  });
  const eligibility = useQuery({
    queryKey: [...challengeKey(groupId, challengeId), 'eligibility'],
    queryFn: () => challengesApi.eligibility(groupId, challengeId),
    staleTime: 0,
  });
  const e = eligibility.data;
  const canShoot = Boolean(e?.eligible) && ready && !shooting;

  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(`/community/${groupId}/challenges/${challengeId}`);

  async function shoot() {
    if (!camera.current || !canShoot) return;
    setShooting(true);
    try {
      const photo = await camera.current.takePictureAsync({
        quality: 0.6,
        exif: false,
        base64: true,
      });
      if (photo?.base64) dispatch({ type: 'shot', photo: { base64: photo.base64 } });
    } catch {
      setCameraFailed(true);
    } finally {
      setShooting(false);
    }
  }

  async function send() {
    if (state.step !== 'review' || !e?.workout) return;
    const photo = state.photo;
    dispatch({ type: 'send' });
    try {
      const fileId = await uploadCheckinPhoto(groupId, photo);
      const d: ChallengeDetail = await challengesApi.checkin(groupId, challengeId, {
        photoFileId: fileId,
        workoutSessionId: e.workout.id,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      });
      qc.setQueryData(challengeKey(groupId, challengeId), d);
      void qc.invalidateQueries({ queryKey: challengeListKey(groupId), exact: true });
      dispatch({ type: 'succeeded', detail: d });
    } catch (err) {
      dispatch({ type: 'failed', message: sendError(err) });
      // O "já fez hoje" e o prazo mudam o que a câmera mostra.
      void eligibility.refetch();
    }
  }

  const title = detail.data?.title ?? 'Check-in';
  const onRequestClose = () => {
    if (state.step === 'review') dispatch({ type: 'retake' });
    else if (state.step !== 'sending') close();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onRequestClose} statusBarTranslucent>
      {state.step === 'camera' ? (
        <View className="flex-1 bg-black">
          {!permission ? null : !permission.granted || cameraFailed ? (
            <View className="flex-1" style={{ paddingTop: insets.top + 64 }}>
              <NoCamera
                canAsk={permission.canAskAgain}
                onAsk={() => void requestPermission()}
                failed={cameraFailed}
              />
            </View>
          ) : (
            <CameraView
              ref={camera}
              style={{ flex: 1 }}
              facing={facing}
              onCameraReady={() => setReady(true)}
              onMountError={() => setCameraFailed(true)}
            />
          )}

          <View
            className="absolute inset-x-4 flex-row items-center justify-between"
            style={{ top: insets.top + 8 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={close}
              className="h-11 w-11 items-center justify-center rounded-full bg-black/45"
            >
              <Icon name="x" color="#fff" />
            </Pressable>
            <View className="h-9 max-w-[60%] flex-row items-center gap-1.5 rounded-pill bg-black/45 px-3">
              <Icon name="camera" size={16} color="#fff" />
              <Text numberOfLines={1} className="font-sans-semibold text-xs text-white">
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                facing === 'back' ? 'Usar a câmera frontal' : 'Usar a câmera traseira'
              }
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              className="h-11 w-11 items-center justify-center rounded-full bg-black/45"
            >
              <Icon name="repeat" color="#fff" />
            </Pressable>
          </View>

          <View className="absolute inset-x-4 gap-4" style={{ bottom: insets.bottom + 24 }}>
            {eligibility.isError ? (
              <View className="gap-2 rounded-2xl bg-black/60 p-3.5">
                <Text className="text-sm text-white">
                  {apiMessage(eligibility.error, 'Não deu para conferir seu treino agora.')}
                </Text>
                <Button size="sm" variant="secondary" onPress={() => void eligibility.refetch()}>
                  Tentar de novo
                </Button>
              </View>
            ) : (
              <WorkoutCard e={e} />
            )}
            <View className="items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tirar foto"
                accessibilityState={{ disabled: !canShoot, busy: shooting }}
                disabled={!canShoot}
                onPress={() => void shoot()}
                className={cn(
                  'h-[84px] w-[84px] items-center justify-center rounded-full border-[5px] border-white',
                  canShoot ? 'bg-primary' : 'opacity-40',
                )}
              >
                {shooting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
              </Pressable>
              {e ? (
                <Text className="px-6 text-center text-xs text-white/90">{checkinHint(e)}</Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {state.step === 'review' || state.step === 'sending' ? (
        <KeyboardAvoidingView
          className="flex-1 bg-background"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 24,
              paddingHorizontal: 24,
              gap: 14,
            }}
          >
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tirar outra"
                disabled={state.step === 'sending'}
                onPress={() => dispatch({ type: 'retake' })}
                className="h-11 w-11 items-center justify-center rounded-full bg-card"
              >
                <Icon name="chevL" />
              </Pressable>
              <Text className="font-sans-bold text-foreground">Check-in</Text>
              <View className="w-11" />
            </View>

            <View className="h-[300px] overflow-hidden rounded-3xl bg-muted">
              <Image
                source={{ uri: checkinPhotoPreview(state.photo) }}
                accessibilityLabel="Sua foto de agora"
                accessibilityIgnoresInvertColors
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              <View className="absolute bottom-3 left-3 rounded-lg bg-black/65 px-2 py-1">
                <Text className="font-sans-extrabold text-[11px] tracking-wider text-white">
                  {checkinStamp(new Date(), e?.workout ?? null)}
                </Text>
              </View>
              {state.step === 'sending' ? (
                // Enviando (`MediaStatus` PENDING): o véu com o spinner até a API confirmar.
                <View className="absolute inset-0 items-center justify-center gap-2 bg-black/45">
                  <ActivityIndicator color="#fff" />
                  <Text className="font-sans-semibold text-sm text-white">Enviando a foto…</Text>
                </View>
              ) : null}
            </View>

            {e?.workout ? (
              <View className="flex-row items-center gap-3 rounded-[18px] bg-card px-3.5 py-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                  <Icon name="dumbbell" size={20} color={colors.primaryText} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-bold text-sm text-foreground">
                    {workoutSpan(e.workout)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{workoutMeta(e)}</Text>
                </View>
                <Icon name="check" size={20} color={colors.primaryText} />
              </View>
            ) : null}

            <View className="gap-1.5">
              <Text className="text-xs text-muted-foreground">Legenda (opcional)</Text>
              <Input
                value={caption}
                onChangeText={setCaption}
                maxLength={CHECKIN_CAPTION_MAX}
                placeholder="Como foi?"
                accessibilityLabel="Legenda (opcional)"
                editable={state.step !== 'sending'}
                className="min-h-[52px] rounded-field border-0 bg-card px-4 text-base"
              />
              {caption.length > CHECKIN_CAPTION_MAX - 20 ? (
                <Text className="text-right text-xs text-muted-foreground">
                  {`${caption.length}/${CHECKIN_CAPTION_MAX}`}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-start gap-2">
              <Icon name="shield" size={16} color={colors.mutedForeground} />
              <Text className="flex-1 text-xs text-muted-foreground">
                A foto vai com data e hora gravadas e ligada a este treino. Se você editar o treino
                depois, o check-in volta para revisão.
              </Text>
            </View>
            <View className="flex-row items-start gap-2">
              <Icon name="lock" size={16} color={colors.mutedForeground} />
              <Text className="flex-1 text-xs text-muted-foreground">
                Só você e a equipe que revisa veem a foto.
              </Text>
            </View>

            {state.step === 'review' && state.error ? (
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {state.error}
              </Text>
            ) : null}

            <Button
              size="xl"
              loading={state.step === 'sending'}
              disabled={!e?.eligible}
              onPress={() => void send()}
            >
              {detail.data ? checkinButtonLabel(detail.data) : 'Fazer check-in'}
            </Button>
            {e && !e.eligible ? (
              <Text className="text-center text-xs text-muted-foreground">{checkinHint(e)}</Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {state.step === 'done' ? (
        <View
          className="flex-1 items-center gap-3.5 bg-background px-6"
          style={{ paddingTop: insets.top + 96, paddingBottom: insets.bottom + 32 }}
        >
          <View className="h-[84px] w-[84px] items-center justify-center rounded-full bg-primary">
            <Icon name="check" size={32} color={colors.primaryForeground} />
          </View>
          <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
            Check-in feito
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            {doneSummary(state.detail)}
          </Text>
          <View className="flex-row gap-2">
            <Badge variant="done">treino no app</Badge>
            <Badge variant="done">foto na hora</Badge>
          </View>
          <View className="flex-1" />
          <Button
            size="xl"
            className="self-stretch"
            // Volta à tela do desafio se ela está atrás; senão, troca esta por ela.
            onPress={() => router.dismissTo(`/community/${groupId}/challenges/${challengeId}`)}
          >
            Ver o desafio
          </Button>
          <Button variant="ghost" className="self-stretch" onPress={() => router.navigate('/')}>
            Voltar ao Hoje
          </Button>
        </View>
      ) : null}
    </Modal>
  );
}
