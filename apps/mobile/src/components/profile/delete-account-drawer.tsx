import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DELETE_ACCOUNT_CONFIRMATION, usersApi } from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
  Label,
} from '@/components/ui';

/**
 * Apagar a conta de dentro do app.
 *
 * Não tem equivalente no PWA — lá o direito existe só pelo endpoint e pelo
 * Claude. Aqui é obrigatório: App Store e Play Store recusam app que cria conta
 * e não deixa apagá-la pela própria interface.
 */
export function DeleteAccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const { signOut } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setConfirmation('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => usersApi.deleteMe(confirmation.trim()),
    onSuccess: async (result) => {
      onClose();
      // O cache guarda refeições, treinos e peso da conta que acabou de deixar
      // de existir. Sem limpar, a próxima sessão nesse aparelho abriria com os
      // dados de quem saiu.
      qc.clear();
      Alert.alert('Conta apagada', result.message);
      await signOut();
    },
  });

  const canConfirm = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Apagar minha conta</DrawerTitle>
          <DrawerDescription>
            Isso remove sua conta e todos os dados: refeições, treinos, pesos, passos e metas.
          </DrawerDescription>
        </DrawerHeader>

        <View className="my-3 gap-4">
          <View className="rounded-xl border border-destructive bg-card p-3">
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-sm font-bold text-destructive"
            >
              Ação irreversível. Não há como recuperar depois.
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Se quiser guardar uma cópia, exporte seus dados antes.
            </Text>
          </View>

          <View className="gap-1.5">
            <Label>Digite {DELETE_ACCOUNT_CONFIRMATION} para confirmar</Label>
            <DrawerTextInput
              accessibilityLabel={`Confirmação. Digite ${DELETE_ACCOUNT_CONFIRMATION}`}
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder={DELETE_ACCOUNT_CONFIRMATION}
              placeholderTextColor="#8a8a8a"
              selectionColor="#2ce500"
              autoCapitalize="characters"
              autoCorrect={false}
              className="min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </View>

          <FormMessage>{mutation.error?.message}</FormMessage>

          <Button
            variant="destructive"
            className="w-full"
            disabled={!canConfirm}
            loading={mutation.isPending}
            onPress={() => mutation.mutate()}
            accessibilityLabel="Apagar minha conta definitivamente"
          >
            {mutation.isPending ? 'Apagando…' : 'Apagar minha conta'}
          </Button>

          <Button variant="ghost" className="w-full" onPress={onClose}>
            Cancelar
          </Button>
        </View>
      </DrawerContent>
    </Drawer>
  );
}
