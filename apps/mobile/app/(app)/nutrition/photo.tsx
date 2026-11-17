import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  MEAL_PHOTO_COPY,
  isAiConsentRequired,
  mealTypeForTime,
  nutritionApi,
  planHref,
  usersApi,
  type MealRecognition,
  type MealType,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer, LoadingState, useActionSheet } from '@/components/ui';
import { PhotoCapture } from '@/components/nutrition/photo-capture';
import { RecognitionReviewDrawer } from '@/components/nutrition/recognition-review-drawer';
import {
  ROTULO_REFEICAO,
  TIPOS_DE_REFEICAO,
  hojeIso,
  mensagemDeErro,
} from '@/components/nutrition/helpers';
import { openLegal } from '@/components/profile/legal';
import { useAcceptAiConsent, useAiConsent } from '@/chat/ai-consent';

/**
 * Registro de refeição por foto (#139).
 *
 * No PWA o mesmo fluxo usa o seletor de arquivo (`/nutrition/photo`, #385).
 * Antes da primeira foto, o aviso com o nome do provedor é o aceite do chat (#384):
 * sem ele a API responde 403 `AI_CONSENT_REQUIRED`, e o aviso volta.
 *
 * **A foto só fica guardada com o consentimento** (ADR 038, #374): na primeira
 * foto o app pergunta "Guardar as fotos das refeições?" (a escolha muda em
 * Você). Guardada, ela vai junto da refeição que a pessoa confirmar; sem o sim,
 * ou sem refeição, é descartada. O que sai para o provedor está em
 * `docs/DATA_RETENTION.md`.
 *
 * **O reconhecimento não grava.** Ele devolve uma sugestão; quem grava é o
 * caminho manual de sempre, a partir do drawer de confirmação. É isso que torna
 * a confirmação obrigatória por construção, e não por disciplina.
 */
export default function PhotoScreen() {
  const router = useRouter();
  const { mealId, mealType, date } = useLocalSearchParams<{
    mealId?: string;
    mealType?: MealType;
    date?: string;
  }>();

  const [resultado, setResultado] = useState<MealRecognition | null>(null);
  // A refeição de destino ("Vai para:", prancha Al-M12): a da tela de origem, ou a da hora.
  const [refeicao, setRefeicao] = useState<MealType>(mealType ?? mealTypeForTime(new Date()));
  // A foto que espera o aviso do provedor (primeira vez, ou o 403 do aceite da #384).
  const [aguardandoAceite, setAguardandoAceite] = useState<string | null>(null);
  const [avisoDaFoto, setAvisoDaFoto] = useState<string | null>(null);
  const qc = useQueryClient();
  const actionSheet = useActionSheet();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const keepPhotos = me.data?.keepMealPhotos ?? null;
  const aceites = useAiConsent();
  const aceitar = useAcceptAiConsent();

  const reconhecer = useMutation<MealRecognition, Error, string>({
    mutationFn: (jpegBase64) => nutritionApi.recognizeMealPhoto(jpegBase64),
    onSuccess: setResultado,
    onError: (erro, jpegBase64) => {
      // O aceite caiu (texto novo): o aviso volta com a mesma foto, em vez de um erro.
      if (isAiConsentRequired(erro)) {
        reconhecer.reset();
        void aceites.refetch();
        setAguardandoAceite(jpegBase64);
      }
    },
  });

  const dia = date ?? hojeIso();

  /**
   * Primeira foto (preferência ainda `null`): pergunta antes de mandar, porque
   * é no reconhecimento que a foto fica guardada ou não. Fechar sem escolher
   * não manda nada; a câmera continua aberta.
   */
  const recognize = (jpegBase64: string) => {
    // Antes da primeira foto: o nome do provedor e o link dos dados (Al-M12). É o aceite do chat.
    if (aceites.data && !aceites.data.chat.accepted) {
      setAguardandoAceite(jpegBase64);
      return;
    }
    perguntarSeGuarda(jpegBase64);
  };

  /**
   * Primeira foto (preferência ainda `null`): pergunta antes de mandar, porque
   * é no reconhecimento que a foto fica guardada ou não. Fechar sem escolher
   * não manda nada; a câmera continua aberta.
   */
  const perguntarSeGuarda = (jpegBase64: string) => {
    if (keepPhotos !== null || !me.data) {
      reconhecer.mutate(jpegBase64);
      return;
    }
    const choose = (keep: boolean) => {
      setAvisoDaFoto(keep ? MEAL_PHOTO_COPY.keptYes : MEAL_PHOTO_COPY.keptNo);
      void usersApi
        .updateMe({ keepMealPhotos: keep })
        .then((user) => qc.setQueryData(['users', 'me'], user))
        .finally(() => reconhecer.mutate(jpegBase64));
    };
    actionSheet({
      title: MEAL_PHOTO_COPY.keepTitle,
      description: MEAL_PHOTO_COPY.keepBody,
      options: [
        { label: MEAL_PHOTO_COPY.keepYes, onPress: () => choose(true) },
        { label: MEAL_PHOTO_COPY.keepNo, onPress: () => choose(false) },
      ],
    });
  };

  const aceitarEUsar = () => {
    const foto = aguardandoAceite;
    if (!foto) return;
    aceitar.mutate('chat', {
      onSuccess: () => {
        setAguardandoAceite(null);
        perguntarSeGuarda(foto);
      },
    });
  };

  const trocarRefeicao = () =>
    setRefeicao(
      (atual) =>
        TIPOS_DE_REFEICAO[(TIPOS_DE_REFEICAO.indexOf(atual) + 1) % TIPOS_DE_REFEICAO.length]!,
    );

  const irParaOManual = () => {
    // O registro manual é a mesma tela de nutrição de sempre. Voltar já basta:
    // a busca de alimento abre de lá, e nenhum estado precisa viajar junto.
    router.back();
  };

  const planoNecessario = reconhecer.error instanceof ApiError && reconhecer.error.isPlanRequired;
  const falha =
    reconhecer.error && !isAiConsentRequired(reconhecer.error)
      ? mensagemDeErro(reconhecer.error, {
          alternativa: 'Não consegui analisar a foto. Registre pela busca de alimento.',
        })
      : null;

  return (
    <>
      <Screen scroll={false}>
        <View className="flex-1 px-5 pb-4 pt-2">
          {mealId ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${MEAL_PHOTO_COPY.goesTo} ${ROTULO_REFEICAO[refeicao]}. Toque para trocar`}
              onPress={trocarRefeicao}
              className="mb-3 min-h-[44px] flex-row items-center gap-1 self-start rounded-full border border-border px-4"
            >
              <Text className="text-sm text-muted-foreground">{MEAL_PHOTO_COPY.goesTo}</Text>
              <Text className="text-sm font-semibold text-foreground">
                {ROTULO_REFEICAO[refeicao]}
              </Text>
            </Pressable>
          )}
          <View className="flex-1 overflow-hidden rounded-lg border border-border">
            <PhotoCapture
              onCapturada={recognize}
              ativo={resultado === null && !reconhecer.isPending && aguardandoAceite === null}
            />
          </View>

          <View className="gap-3 pt-4">
            {aguardandoAceite ? (
              <View className="gap-2 rounded-2xl border border-border bg-card p-4">
                <Text className="text-base font-bold text-foreground">
                  {MEAL_PHOTO_COPY.firstTitle}
                </Text>
                <Text className="text-sm text-muted-foreground">{MEAL_PHOTO_COPY.firstBody}</Text>
                <Text className="text-xs text-muted-foreground">{MEAL_PHOTO_COPY.keepNote}</Text>
                <Pressable accessibilityRole="link" onPress={() => openLegal('/privacy')}>
                  <Text className="text-sm font-semibold text-primary-text underline">
                    {MEAL_PHOTO_COPY.dataLink}
                  </Text>
                </Pressable>
                {aceitar.isError ? (
                  <Text accessibilityRole="alert" className="text-xs text-destructive">
                    Não consegui gravar o aceite. Tente de novo.
                  </Text>
                ) : null}
                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={() => setAguardandoAceite(null)}
                  >
                    {MEAL_PHOTO_COPY.retake}
                  </Button>
                  <Button className="flex-1" loading={aceitar.isPending} onPress={aceitarEUsar}>
                    {MEAL_PHOTO_COPY.acceptAndUse}
                  </Button>
                </View>
              </View>
            ) : null}
            {avisoDaFoto ? (
              <Text className="text-xs text-muted-foreground">{avisoDaFoto}</Text>
            ) : null}
            {reconhecer.isPending ? (
              // A pessoa fica olhando isto por 30 s ou mais: visão em CPU é lenta,
              // e um rótulo genérico ("Carregando…") faz parecer travado.
              <LoadingState
                label={`${MEAL_PHOTO_COPY.recognizing} Isso pode levar até um minuto.`}
              />
            ) : null}

            {falha ? (
              <>
                <Text accessibilityRole="alert" className="text-sm text-destructive">
                  {falha}
                </Text>
                <View className="flex-row gap-2">
                  {planoNecessario ? (
                    // 402 (ADR 024): a foto é do PRO. Tentar de novo não adianta.
                    <Button
                      variant="outline"
                      className="flex-1"
                      onPress={() => router.replace(planHref('foto'))}
                    >
                      Ver o plano PRO
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1" onPress={() => reconhecer.reset()}>
                      Tentar outra foto
                    </Button>
                  )}
                  <Button className="flex-1" onPress={irParaOManual}>
                    Registrar à mão
                  </Button>
                </View>
              </>
            ) : !reconhecer.isPending && resultado === null && aguardandoAceite === null ? (
              <Text className="text-center text-xs text-muted-foreground">
                {MEAL_PHOTO_COPY.framing}.{' '}
                {keepPhotos === true
                  ? 'A foto fica guardada junto da refeição; dá para apagar só ela depois.'
                  : 'A foto é analisada e descartada.'}
              </Text>
            ) : null}
          </View>
        </View>
      </Screen>

      <DrawerLayer>
        {resultado ? (
          <RecognitionReviewDrawer
            open
            onOpenChange={(aberto) => {
              if (!aberto) {
                setResultado(null);
                reconhecer.reset();
              }
            }}
            resultado={resultado}
            mealId={mealId}
            mealType={mealId ? mealType : refeicao}
            date={dia}
            onRegistrado={() => router.back()}
            onRegistrarManualmente={irParaOManual}
          />
        ) : null}
      </DrawerLayer>
    </>
  );
}
