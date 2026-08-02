import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { nutritionApi, type BarcodeLookup, type MealType } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer, LoadingState } from '@/components/ui';
import { BarcodeCamera } from '@/components/nutrition/barcode-camera';
import { ScannedProductDrawer } from '@/components/nutrition/scanned-product-drawer';
import { mensagemDeFalhaNaConsulta, podeProcessarLeitura } from '@/components/nutrition/barcode';
import { hojeIso } from '@/components/nutrition/helpers';

/**
 * Scanner de código de barras (#140).
 *
 * Só existe no app nativo: a leitura no navegador depende de `BarcodeDetector`,
 * que o Safari não tem. O PWA continua na busca por nome — ver
 * `docs/MOBILE_PARITY.md`.
 *
 * O produto vem do Open Food Facts sob demanda e **não é gravado** no catálogo:
 * o que sai daqui é o número do código de barras, e nada do usuário (ADR 017).
 */
export default function ScanScreen() {
  const router = useRouter();
  const { mealId, mealType, date } = useLocalSearchParams<{
    mealId?: string;
    mealType?: MealType;
    date?: string;
  }>();

  const [resultado, setResultado] = useState<BarcodeLookup | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  /**
   * Último código já tratado. É `ref` e não `state` de propósito: a câmera
   * dispara antes de um `setState` chegar ao próximo render, e a trava tem que
   * valer já na chamada seguinte.
   */
  const ultimoCodigo = useRef<string | null>(null);

  const consultar = useMutation({
    mutationFn: (codigo: string) => nutritionApi.lookupBarcode(codigo),
    onSuccess: (lookup) => {
      setFalha(null);
      setResultado(lookup);
    },
    onError: (erro) => {
      setResultado(null);
      setFalha(mensagemDeFalhaNaConsulta(erro));
    },
  });

  const aoLer = (codigo: string) => {
    if (!podeProcessarLeitura(codigo, ultimoCodigo.current)) return;
    ultimoCodigo.current = codigo;
    consultar.mutate(codigo);
  };

  const liberarParaNovaLeitura = () => {
    ultimoCodigo.current = null;
    setResultado(null);
    setFalha(null);
    consultar.reset();
  };

  const dia = date ?? hojeIso();

  return (
    <>
      <Screen title="Escanear produto" back scroll={false}>
        <View className="flex-1 px-5 pb-4 pt-2">
          <View className="flex-1 overflow-hidden rounded-lg border border-border">
            <BarcodeCamera onLido={aoLer} ativo={resultado === null && !consultar.isPending} />
          </View>

          <View className="gap-3 pt-4">
            {consultar.isPending ? <LoadingState label="Consultando o produto…" /> : null}

            {falha ? (
              <>
                <Text accessibilityRole="alert" className="text-sm text-destructive">
                  {falha}
                </Text>
                <View className="flex-row gap-2">
                  <Button variant="outline" className="flex-1" onPress={liberarParaNovaLeitura}>
                    Escanear de novo
                  </Button>
                  <Button
                    className="flex-1"
                    onPress={() => router.back()}
                    accessibilityLabel="Cadastrar pelo rótulo"
                  >
                    Cadastrar à mão
                  </Button>
                </View>
              </>
            ) : (
              <Text className="text-center text-xs text-muted-foreground">
                Aponte para o código de barras da embalagem.
              </Text>
            )}
          </View>
        </View>
      </Screen>

      <DrawerLayer>
        {resultado ? (
          <ScannedProductDrawer
            open
            onOpenChange={(aberto) => !aberto && liberarParaNovaLeitura()}
            resultado={resultado}
            mealId={mealId}
            mealType={mealType}
            date={dia}
            onRegistrado={() => router.back()}
          />
        ) : null}
      </DrawerLayer>
    </>
  );
}
