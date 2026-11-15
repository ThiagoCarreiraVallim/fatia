import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DELETE_ACCOUNT_CONFIRMATION,
  groupsApi,
  isDeleteConfirmed,
  usersApi,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { Screen } from '@/components/layout/screen';
import { Button, FormMessage, Input } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useExportData } from '@/components/you/use-export-data';
import { disablePush } from '@/notifications/push';
import { colors } from '@/theme/colors';

/**
 * Apagar conta (prancha Al-V8) — réplica de
 * `apps/web/src/components/you/delete-account-screen.tsx`. A loja exige a
 * exclusão dentro do app; o botão só acende com APAGAR, e a API confere de novo.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const exportData = useExportData();
  const groups = useQuery({ queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() });
  const owned = (groups.data ?? []).filter((g) => g.role === 'OWNER').map((g) => g.name);

  const remove = useMutation({
    mutationFn: () => usersApi.deleteMe(DELETE_ACCOUNT_CONFIRMATION),
    onSuccess: () => {
      qc.clear();
      void disablePush().finally(() => void signOut());
    },
  });

  const ok = isDeleteConfirmed(typed);

  return (
    <Screen>
      <View className="gap-4 px-6 pb-8 pt-2">
        <View className="mt-2 h-16 w-16 items-center justify-center rounded-[22px] bg-danger/15">
          <Icon name="trash" size={28} color={colors.danger} />
        </View>
        <Text accessibilityRole="header" className="font-display text-[28px] text-foreground">
          Apagar tudo?
        </Text>
        <Text className="text-[15px] text-muted-foreground">
          Refeições, treinos, pesos, passos, metas e conversas com a IA. Não dá para recuperar.
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={exportData.isPending}
          onPress={() => exportData.mutate()}
          className="flex-row items-center gap-3 rounded-card bg-card p-4 active:opacity-80"
        >
          <Icon name="download" size={20} color={colors.primaryText} />
          <Text className="flex-1 text-[15px] text-foreground">
            {exportData.isPending ? 'Preparando arquivo…' : 'Exportar uma cópia antes'}
          </Text>
          <Icon name="chevR" size={18} color={colors.mutedForeground} />
        </Pressable>

        <View className="flex-row items-start gap-3 rounded-field bg-warning/10 p-4">
          <Icon name="info" size={20} color={colors.warning} />
          <Text className="flex-1 text-[13px] text-foreground">
            PRO assinado na loja: cancele na App Store ou Google Play.
          </Text>
        </View>

        {owned.length > 0 ? (
          <View className="gap-1 rounded-field bg-danger/10 p-4">
            <Text className="font-sans-bold text-sm text-danger">
              {`Esta conta é a dona de ${owned.join(', ')}`}
            </Text>
            <Text className="text-[13px] text-foreground">
              A comunidade é apagada junto, com a cobrança dos assentos. Para mantê-la, transfira a
              outra pessoa da equipe antes.
            </Text>
          </View>
        ) : null}

        <Text className="text-[13px] text-muted-foreground">
          Sem o app? Também dá para pedir pela web, em fat.ia.br/apagar-conta.
        </Text>

        <View className="gap-1.5">
          <Text className="font-sans-semibold text-[13px] text-muted-foreground">
            Digite {DELETE_ACCOUNT_CONFIRMATION} para confirmar
          </Text>
          <Input
            accessibilityLabel={`Digite ${DELETE_ACCOUNT_CONFIRMATION} para confirmar`}
            className="h-12 rounded-field border-0 bg-card px-3.5 text-[15px]"
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={DELETE_ACCOUNT_CONFIRMATION}
            value={typed}
            onChangeText={setTyped}
          />
        </View>

        <FormMessage>{remove.error?.message}</FormMessage>
        <Button
          size="xl"
          variant="destructive"
          className="w-full"
          disabled={!ok}
          loading={remove.isPending}
          onPress={() => remove.mutate()}
        >
          Apagar minha conta
        </Button>
        <Button size="xl" variant="text" className="w-full" onPress={() => router.back()}>
          Cancelar
        </Button>
      </View>
    </Screen>
  );
}
