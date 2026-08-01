import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Flag, LogOut, Settings, Shield, Watch } from 'lucide-react-native';
import { usersApi } from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui';
import { DeleteAccountDrawer } from '@/components/profile/delete-account-drawer';
import { EditHeightDrawer } from '@/components/profile/edit-height-drawer';
import { McpSection } from '@/components/profile/mcp-section';
import { MenuItem } from '@/components/profile/menu-item';
import { openLegal } from '@/components/profile/legal';
import { PrivacyCard } from '@/components/profile/privacy-card';
import { ProfileMetrics } from '@/components/profile/profile-metrics';

export default function ProfileScreen() {
  const [heightOpen, setHeightOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();

  // No PWA os dados do usuário vêm do servidor (`getCurrentUser()`); aqui vêm da
  // API, na mesma chave que o `ProfileMetrics` usa — uma requisição só.
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      qc.refetchQueries({ queryKey: ['users', 'me'] }),
      qc.refetchQueries({ queryKey: ['dashboard', 'today'] }),
    ]).finally(() => setRefreshing(false));
  }, [qc]);

  const confirmSignOut = () => {
    Alert.alert('Sair da conta', 'Você vai precisar entrar de novo para usar o app.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          qc.clear();
          void signOut();
        },
      },
    ]);
  };

  const name = me.data?.name;
  const initial = (name ?? 'A').slice(0, 1).toUpperCase();

  return (
    <>
      <Screen onRefresh={handleRefresh} refreshing={refreshing}>
        <View className="gap-5 px-5 pb-4 pt-4">
          <View className="items-center pt-2">
            <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-card">
              <Text className="text-3xl font-extrabold text-primary">{initial}</Text>
            </View>
            <Text
              accessibilityRole="header"
              className="mt-3 text-2xl font-extrabold text-foreground"
            >
              {name ? name : 'Atleta Fatia'}
            </Text>
            {me.data?.email ? (
              <Text className="text-xs text-muted-foreground">{me.data.email}</Text>
            ) : null}
          </View>

          <ProfileMetrics onEditHeight={() => setHeightOpen(true)} />

          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <MenuItem
              icon={<Flag size={18} color="#2ce500" />}
              title="Metas"
              subtitle="Acompanhe seus objetivos pessoais"
              onPress={() => router.push('/goals')}
            />
            <MenuItem
              icon={<Settings size={18} color="#2ce500" />}
              title="Metas de nutrição"
              subtitle="Calorias e macros diários"
              onPress={() => router.push('/nutrition/goals')}
            />
            <MenuItem
              icon={<Watch size={18} color="#2ce500" />}
              title="Dispositivos"
              subtitle="Integração com Apple Health e Garmin"
              onPress={() => router.push('/profile/tokens')}
            />
            <MenuItem
              icon={<Shield size={18} color="#2ce500" />}
              title="Privacidade e dados"
              subtitle="O que guardamos, e como exportar ou apagar"
              onPress={() => openLegal('/privacy')}
              last
            />
          </View>

          <PrivacyCard onDeleteAccount={() => setDeleteOpen(true)} />

          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-2xl border-destructive"
            onPress={confirmSignOut}
            accessibilityLabel="Sair da conta"
          >
            <LogOut size={18} color="#93000a" />
            <Text className="text-base font-bold text-destructive">Sair da conta</Text>
          </Button>

          <McpSection />
        </View>
      </Screen>

      {/* Bottom sheets ficam fora do `Screen`: eles se posicionam sobre o pai em
          `absoluteFill`, e dentro do `ScrollView` acompanhariam o conteúdo. */}
      <EditHeightDrawer
        open={heightOpen}
        onClose={() => setHeightOpen(false)}
        currentHeightCm={me.data?.heightCm ?? null}
      />
      <DeleteAccountDrawer open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}
