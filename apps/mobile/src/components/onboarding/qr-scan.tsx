import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { codeFromQr } from '@fatia/api-client';
import { Button, Icon, Text } from '@/components/ui';

/**
 * "Ler QR da recepção" (Onb-Codigo): a câmera lê só QR e devolve o código da
 * comunidade. A imagem não sai do aparelho. `expo-camera` funciona no Expo Go.
 */
export function QrScanModal({
  open,
  onClose,
  onCode,
  parse = codeFromQr,
  title = 'Ler QR da recepção',
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  /** O que o QR precisa trazer; `null` = não serve. Na comunidade, aceita também o link de convite. */
  parse?: (raw: string) => string | null;
  title?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="text-base font-bold text-white">{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose}>
            <Icon name="x" color="#fff" />
          </Pressable>
        </View>
        {!permission ? null : !permission.granted ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-white">
              Para ler o QR, o Fatia precisa da câmera.
            </Text>
            {permission.canAskAgain ? (
              <Button onPress={() => void requestPermission()}>Permitir câmera</Button>
            ) : (
              <Text className="text-center text-sm text-white/70">
                Libere a câmera para o Fatia nos ajustes do aparelho.
              </Text>
            )}
          </View>
        ) : (
          <View className="flex-1">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                open
                  ? ({ data }) => {
                      const code = parse(data);
                      if (code) onCode(code);
                      else setInvalid(true);
                    }
                  : undefined
              }
            />
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
              <View className="h-60 w-60 rounded-lg border-2 border-primary/80" />
            </View>
            {invalid ? (
              <Text className="absolute bottom-10 left-0 right-0 text-center text-sm text-white">
                Este QR não tem um código de comunidade.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
