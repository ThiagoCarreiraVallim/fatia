import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { nutritionApi, type MealRecognition, type MealType } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer, LoadingState } from '@/components/ui';
import { PhotoCapture } from '@/components/nutrition/photo-capture';
import { RecognitionReviewDrawer } from '@/components/nutrition/recognition-review-drawer';
import { hojeIso, mensagemDeErro } from '@/components/nutrition/helpers';

/**
 * Registro de refeição por foto (#139).
 *
 * Só existe no app nativo: o PWA não tem câmera nem galeria e continua na busca
 * por nome — ver `docs/MOBILE_PARITY.md`.
 *
 * **A foto não é armazenada em lugar nenhum** (ADR 004). Ela sai do aparelho,
 * é analisada e descartada; o que entra no banco são os dados estruturados que a
 * pessoa confirmar na tela seguinte. O que sai para o provedor está escrito em
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

  const reconhecer = useMutation<MealRecognition, Error, string>({
    mutationFn: (jpegBase64) => nutritionApi.recognizeMealPhoto(jpegBase64),
    onSuccess: setResultado,
  });

  const dia = date ?? hojeIso();

  const irParaOManual = () => {
    // O registro manual é a mesma tela de nutrição de sempre. Voltar já basta:
    // a busca de alimento abre de lá, e nenhum estado precisa viajar junto.
    router.back();
  };

  const falha = reconhecer.error
    ? mensagemDeErro(reconhecer.error, {
        alternativa: 'Não consegui analisar a foto. Registre pela busca de alimento.',
      })
    : null;

  return (
    <>
      <Screen title="Registrar por foto" back scroll={false}>
        <View className="flex-1 px-5 pb-4 pt-2">
          <View className="flex-1 overflow-hidden rounded-lg border border-border">
            <PhotoCapture
              onCapturada={(base64) => reconhecer.mutate(base64)}
              ativo={resultado === null && !reconhecer.isPending}
            />
          </View>

          <View className="gap-3 pt-4">
            {reconhecer.isPending ? (
              // A pessoa fica olhando isto por 30 s ou mais: visão em CPU é lenta,
              // e um rótulo genérico ("Carregando…") faz parecer travado.
              <LoadingState label="Analisando o prato… isso pode levar até um minuto." />
            ) : null}

            {falha ? (
              <>
                <Text accessibilityRole="alert" className="text-sm text-destructive">
                  {falha}
                </Text>
                <View className="flex-row gap-2">
                  <Button variant="outline" className="flex-1" onPress={() => reconhecer.reset()}>
                    Tentar outra foto
                  </Button>
                  <Button className="flex-1" onPress={irParaOManual}>
                    Registrar à mão
                  </Button>
                </View>
              </>
            ) : !reconhecer.isPending && resultado === null ? (
              <Text className="text-center text-xs text-muted-foreground">
                Enquadre o prato inteiro. A foto é analisada e descartada — o Fatia não guarda
                imagem.
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
