import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ApiError,
  aiLock,
  canProcessScan,
  customFoodFormFromLabel,
  emptyCustomFoodForm,
  lockAfterClose,
  lookupErrorMessage,
  nutritionApi,
  planHref,
  type BarcodeLookup,
  type CustomFoodForm,
  type Food,
  type MealType,
  type ScanCloseReason,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer, LoadingState, Segmented } from '@/components/ui';
import { BarcodeCamera } from '@/components/nutrition/barcode-camera';
import { CustomFoodDrawer } from '@/components/nutrition/custom-food-drawer';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { PhotoCapture } from '@/components/nutrition/photo-capture';
import { ScannedProductDrawer } from '@/components/nutrition/scanned-product-drawer';
import { hojeIso } from '@/components/nutrition/helpers';

/**
 * Leitor (#140, #375): o código de barras e, na aba "Rótulo", a tabela
 * nutricional pela foto.
 *
 * O PWA tem o seu leitor dentro do drawer de busca (`barcode-flow.tsx`), com
 * a mesma lógica de `@fatia/api-client` — ver `docs/MOBILE_PARITY.md`.
 *
 * O código procura primeiro nos alimentos da pessoa (o vínculo é dela); depois
 * vem do Open Food Facts sob demanda e **não é gravado** no catálogo (ADR 017).
 * A foto do rótulo também não é guardada: a IA devolve os valores e a pessoa
 * confere antes de salvar. Câmera e galeria são do `expo-camera` e do
 * `expo-image-picker`, que já rodam no Expo Go.
 */

type Tab = 'code' | 'label';

export default function ScanScreen() {
  const router = useRouter();
  const { mealId, mealType, date } = useLocalSearchParams<{
    mealId?: string;
    mealType?: MealType;
    date?: string;
  }>();

  const [tab, setTab] = useState<Tab>('code');
  const [result, setResult] = useState<Exclude<BarcodeLookup, { status: 'own' }> | null>(null);
  const [ownFood, setOwnFood] = useState<Food | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Código que não estava em lugar nenhum: segue para o rótulo e o cadastro. */
  const [unknownCode, setUnknownCode] = useState('');
  /** O cadastro já preenchido (rótulo lido ou código não achado). */
  const [createForm, setCreateForm] = useState<CustomFoodForm | null>(null);
  /** Leitura fechada sem registrar. A trava do código continua valendo. */
  const [dismissed, setDismissed] = useState(false);
  /**
   * Último código já tratado. É `ref` e não `state` de propósito: a câmera
   * dispara antes de um `setState` chegar ao próximo render, e a trava tem que
   * valer já na chamada seguinte.
   */
  const lastCode = useRef<string | null>(null);

  // Mesma consulta da foto do prato: sem IA no servidor a aba some; no Free, trava.
  const labelStatus = useQuery({
    queryKey: ['nutrition', 'photo-recognition'],
    queryFn: () => nutritionApi.photoRecognitionStatus(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const labelAccess = aiLock(labelStatus.data);

  const lookup = useMutation({
    mutationFn: (code: string) => nutritionApi.lookupBarcode(code),
    onSuccess: (found) => {
      setFailure(null);
      // O código vinculado a um alimento da pessoa vence o Open Food Facts.
      if (found.status === 'own') setOwnFood(found.food);
      else setResult(found);
    },
    onError: (error, code) => {
      setResult(null);
      setUnknownCode(error instanceof ApiError && error.status === 404 ? code : '');
      setFailure(lookupErrorMessage(error));
    },
  });

  const readLabel = useMutation({
    mutationFn: (jpegBase64: string) => nutritionApi.readLabel(jpegBase64),
    onSuccess: (reading) => setCreateForm(customFoodFormFromLabel(reading, unknownCode)),
  });
  const planRequired = readLabel.error instanceof ApiError && readLabel.error.isPlanRequired;

  const onCode = (code: string) => {
    if (!canProcessScan(code, lastCode.current)) return;
    lastCode.current = code;
    setDismissed(false);
    lookup.mutate(code);
  };

  const close = (reason: ScanCloseReason) => {
    lastCode.current = lockAfterClose(lastCode.current, reason);
    setDismissed(reason === 'dismissed');
    setResult(null);
    setOwnFood(null);
    setFailure(null);
    lookup.reset();
  };

  const day = date ?? hojeIso();
  const showTabs = labelAccess !== 'hidden';

  return (
    <>
      <Screen scroll={false}>
        <View className="flex-1 px-5 pb-4 pt-2">
          {showTabs ? (
            <View className="pb-3">
              <Segmented
                label="Como ler"
                options={[
                  { value: 'code', label: 'Código' },
                  { value: 'label', label: 'Rótulo' },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
          ) : null}

          {tab === 'label' && showTabs ? (
            labelAccess === 'locked' || planRequired ? (
              <View className="flex-1 items-center justify-center gap-3 px-4">
                <Text className="text-center text-base font-medium text-foreground">
                  Ler o rótulo pela foto é do plano PRO
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                  No Free, digite os valores da tabela: dá o mesmo resultado.
                </Text>
                <Button onPress={() => router.push(planHref('foto'))}>Ver o plano PRO</Button>
                <Button
                  variant="outline"
                  onPress={() => setCreateForm({ ...emptyCustomFoodForm(), barcode: unknownCode })}
                >
                  Digitar os valores
                </Button>
              </View>
            ) : (
              <>
                <View className="flex-1 overflow-hidden rounded-lg border border-border">
                  <PhotoCapture
                    onCapturada={(jpeg) => readLabel.mutate(jpeg)}
                    ativo={!readLabel.isPending && createForm === null}
                  />
                </View>
                <View className="gap-3 pt-4">
                  {readLabel.isPending ? <LoadingState label="Lendo o rótulo…" /> : null}
                  {readLabel.error && !planRequired ? (
                    <Text accessibilityRole="alert" className="text-sm text-destructive">
                      {readLabel.error instanceof ApiError && readLabel.error.status !== 500
                        ? readLabel.error.message
                        : 'Não deu para ler o rótulo. Tente outra foto, com a tabela inteira e sem reflexo.'}
                    </Text>
                  ) : null}
                  <Text className="text-center text-xs text-muted-foreground">
                    {unknownCode
                      ? `Código ${unknownCode}: o alimento fica ligado a ele. A foto não fica guardada.`
                      : 'Fotografe a tabela nutricional. Você confere antes de salvar; a foto não fica guardada.'}
                  </Text>
                </View>
              </>
            )
          ) : (
            <>
              <View className="flex-1 overflow-hidden rounded-lg border border-border">
                <BarcodeCamera
                  onLido={onCode}
                  ativo={result === null && ownFood === null && !lookup.isPending}
                />
              </View>

              <View className="gap-3 pt-4">
                {lookup.isPending ? <LoadingState label="Consultando o produto…" /> : null}

                {failure ? (
                  <>
                    <Text accessibilityRole="alert" className="text-sm text-destructive">
                      {failure}
                    </Text>
                    {unknownCode && showTabs ? (
                      <Button
                        onPress={() => {
                          setFailure(null);
                          lookup.reset();
                          setTab('label');
                        }}
                      >
                        Ler o rótulo pela foto
                      </Button>
                    ) : null}
                    <View className="flex-row gap-2">
                      <Button variant="outline" className="flex-1" onPress={() => close('rescan')}>
                        Escanear de novo
                      </Button>
                      <Button
                        variant={unknownCode && showTabs ? 'outline' : 'default'}
                        className="flex-1"
                        // Vira um alimento próprio, ligado ao código lido.
                        onPress={() =>
                          setCreateForm({ ...emptyCustomFoodForm(), barcode: unknownCode })
                        }
                        accessibilityLabel="Cadastrar pelo rótulo"
                      >
                        Cadastrar à mão
                      </Button>
                    </View>
                  </>
                ) : dismissed ? (
                  // O código descartado continua travado, senão a câmera o releria
                  // agora mesmo. Como a embalagem costuma seguir enquadrada, sem
                  // este botão a pessoa que cancelou por engano ficaria sem como
                  // reler o mesmo produto.
                  <>
                    <Text className="text-center text-xs text-muted-foreground">
                      Leitura descartada. Aponte para outro produto ou toque abaixo.
                    </Text>
                    <Button variant="outline" onPress={() => close('rescan')}>
                      Escanear de novo
                    </Button>
                  </>
                ) : (
                  <Text className="text-center text-xs text-muted-foreground">
                    Aponte para o código de barras da embalagem.
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      </Screen>

      <DrawerLayer>
        {result ? (
          <ScannedProductDrawer
            open
            onOpenChange={(open) => !open && close('dismissed')}
            resultado={result}
            mealId={mealId}
            mealType={mealType}
            date={day}
            onRegistrado={() => router.back()}
          />
        ) : null}
        {ownFood ? (
          <FoodSearchDrawer
            open
            onOpenChange={(open) => !open && close('dismissed')}
            initialFood={ownFood}
            mealId={mealId}
            mealType={mealType}
            date={day}
          />
        ) : null}
        {createForm ? (
          <CustomFoodDrawer
            open
            onOpenChange={(open) => {
              if (open) return;
              setCreateForm(null);
              readLabel.reset();
            }}
            food={null}
            initial={createForm}
            // Salvo e vinculado: vai direto para a quantidade, como o código seu.
            onSaved={(food) => {
              setTab('code');
              setOwnFood(food);
            }}
          />
        ) : null}
      </DrawerLayer>
    </>
  );
}
