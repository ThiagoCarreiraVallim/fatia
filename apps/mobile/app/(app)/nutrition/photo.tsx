import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
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
import { hojeIso, mensagemDeErro } from '@/components/nutrition/helpers';
import { needsAiConsent } from '@/chat/ai-consent-state';
import { AiConsentCard } from '@/components/chat/consent';

/**
 * Registro de refeição por foto (#139).
 *
 * Só existe no app nativo: o PWA não tem câmera nem galeria e continua na busca
 * por nome — ver `docs/MOBILE_PARITY.md`.
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
  const qc = useQueryClient();
  const actionSheet = useActionSheet();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const keepPhotos = me.data?.keepMealPhotos ?? null;

  const reconhecer = useMutation<MealRecognition, Error, string>({
    mutationFn: (jpegBase64) => nutritionApi.recognizeMealPhoto(jpegBase64),
    onSuccess: setResultado,
  });

  const dia = date ?? hojeIso();

  /**
   * Primeira foto (preferência ainda `null`): pergunta antes de mandar, porque
   * é no reconhecimento que a foto fica guardada ou não. Fechar sem escolher
   * não manda nada; a câmera continua aberta.
   */
  const recognize = (jpegBase64: string) => {
    if (keepPhotos !== null || !me.data) {
      reconhecer.mutate(jpegBase64);
      return;
    }
    const choose = (keep: boolean) => {
      void usersApi
        .updateMe({ keepMealPhotos: keep })
        .then((user) => qc.setQueryData(['users', 'me'], user))
        .finally(() => reconhecer.mutate(jpegBase64));
    };
    actionSheet({
      title: 'Guardar as fotos das refeições?',
      description:
        'Guardadas, ficam junto da refeição no seu diário, só para você. Dá para mudar em Você.',
      options: [
        { label: 'Guardar as fotos', onPress: () => choose(true) },
        { label: 'Não guardar', onPress: () => choose(false) },
      ],
    });
  };

  const irParaOManual = () => {
    // O registro manual é a mesma tela de nutrição de sempre. Voltar já basta:
    // a busca de alimento abre de lá, e nenhum estado precisa viajar junto.
    router.back();
  };

  const planoNecessario = reconhecer.error instanceof ApiError && reconhecer.error.isPlanRequired;
  // 403 `AI_CONSENT_REQUIRED`: a foto nem saiu; o aceite aparece no lugar do erro.
  const semAceite = needsAiConsent(reconhecer.error);
  const falha =
    reconhecer.error && !semAceite
      ? mensagemDeErro(reconhecer.error, {
          alternativa: 'Não consegui analisar a foto. Registre pela busca de alimento.',
        })
      : null;

  return (
    <>
      <Screen scroll={false}>
        <View className="flex-1 px-5 pb-4 pt-2">
          <View className="flex-1 overflow-hidden rounded-lg border border-border">
            <PhotoCapture
              onCapturada={recognize}
              ativo={resultado === null && !reconhecer.isPending}
            />
          </View>

          <View className="gap-3 pt-4">
            {reconhecer.isPending ? (
              // A pessoa fica olhando isto por 30 s ou mais: visão em CPU é lenta,
              // e um rótulo genérico ("Carregando…") faz parecer travado.
              <LoadingState label="Analisando o prato… isso pode levar até um minuto." />
            ) : null}

            {semAceite ? (
              <AiConsentCard
                onDecline={() => reconhecer.reset()}
                onAccepted={() => reconhecer.reset()}
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
            ) : !reconhecer.isPending && resultado === null ? (
              <Text className="text-center text-xs text-muted-foreground">
                {keepPhotos === true
                  ? 'Enquadre o prato inteiro. A foto fica guardada junto da refeição; dá para apagar só ela depois.'
                  : 'Enquadre o prato inteiro. A foto é analisada e descartada.'}
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
            mealType={mealType}
            date={dia}
            onRegistrado={() => router.back()}
            onRegistrarManualmente={irParaOManual}
          />
        ) : null}
      </DrawerLayer>
    </>
  );
}
