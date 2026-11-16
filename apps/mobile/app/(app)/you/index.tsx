import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IconName } from '@fatia/design';
import {
  activeRemindersLabel,
  billingApi,
  keepPhotosText,
  menuSections,
  newsApi,
  progressApi,
  remindersApi,
  unitPrefsOf,
  unitsSummary,
  usersApi,
  youHeaderLine,
  type MenuItem,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { Screen } from '@/components/layout/screen';
import { openLegal } from '@/components/profile/legal';
import { useChatAvailability } from '@/components/layout/use-ai-state';
import { Button, useConfirm, useToast } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HeightSheet } from '@/components/you/height-sheet';
import { BodyLogSheet } from '@/components/progress/body-log-sheet';
import { REMINDERS_KEY } from '@/components/reminders/keys';
import { NEWS_QUERY_KEY } from '@/components/you/news-cache';
import { useExportData } from '@/components/you/use-export-data';
import { UserAvatar } from '@/components/you/user-avatar';
import { YouRow, YouSection } from '@/components/you/you-list';
import { disablePush } from '@/notifications/push';
import { colors } from '@/theme/colors';

/** `70,2` — o peso do cartão, com vírgula. */
function weightText(kg: number | null | undefined): string {
  return kg == null ? '—' : kg.toFixed(1).replace('.', ',');
}

/**
 * A aba Você (prancha Al-V1, #387) — réplica de
 * `apps/web/src/components/you/you-screen.tsx`. No app não há compra nem preço:
 * "Meu plano" leva à tela do plano, que segue as regras da loja.
 */
export default function YouScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { signIn, signOut } = useAuth();
  const [heightOpen, setHeightOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const today = useQuery({ queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() });
  const plan = useQuery({ queryKey: ['billing', 'plan'], queryFn: () => billingApi.plan() });
  const news = useQuery({ queryKey: NEWS_QUERY_KEY, queryFn: () => newsApi.list(), retry: false });
  const reminders = useQuery({ queryKey: REMINDERS_KEY, queryFn: () => remindersApi.list() });
  const chat = useChatAvailability().data;
  const exportData = useExportData();

  const sections = menuSections({
    platform: 'mobile',
    chatAvailable: chat?.available ?? false,
    chatLocked: chat ? chat.available && !chat.allowed : false,
  });

  const keepPhotos = useMutation({
    mutationFn: (keep: boolean) => usersApi.updateMe({ keepMealPhotos: keep }),
    onSuccess: (data) => {
      qc.setQueryData(['users', 'me'], data);
      toast.show({ message: keepPhotosText(data.keepMealPhotos === true).toast });
    },
    onError: () => toast.show({ message: 'Não deu para salvar. Tente de novo.' }),
  });

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      qc.refetchQueries({ queryKey: ['users', 'me'] }),
      qc.refetchQueries({ queryKey: ['dashboard', 'today'] }),
      qc.refetchQueries({ queryKey: ['billing', 'plan'] }),
      qc.refetchQueries({ queryKey: NEWS_QUERY_KEY }),
      qc.refetchQueries({ queryKey: REMINDERS_KEY }),
    ]).finally(() => setRefreshing(false));
  }, [qc]);

  const confirmSignOut = () =>
    confirm({
      title: 'Sair da conta?',
      description: 'Seus dados ficam guardados. É só entrar de novo.',
      confirmLabel: 'Sair',
      cancelLabel: 'Ficar',
      destructive: true,
      onConfirm: () => {
        qc.clear();
        void disablePush().finally(() => void signOut());
      },
    });

  const user = me.data;
  const units = unitPrefsOf(user);
  const showPlan = plan.data?.requiresPlan === true;
  const keep = user?.keepMealPhotos === true;
  const unread = news.data?.unreadCount ?? 0;

  const detailOf = (item: MenuItem) => {
    if (item.locked) {
      return (
        <View className="rounded-full bg-primary px-1.5">
          <Text className="font-sans-bold text-[10px] text-primary-foreground">PRO</Text>
        </View>
      );
    }
    if (item.key === 'units') return unitsSummary(units);
    if (item.key === 'reminders' && reminders.data) return activeRemindersLabel(reminders.data);
    if (item.key === 'plan' && plan.data) return plan.data.tier === 'PRO' ? 'PRO' : 'Free';
    if (item.key === 'news' && unread > 0) {
      return (
        <View className="h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5">
          <Text className="font-sans-bold text-xs text-primary-foreground">{unread}</Text>
        </View>
      );
    }
    return item.detail;
  };

  const renderItem = (item: MenuItem) => {
    const icon = item.icon as IconName;
    if (item.kind === 'toggle') {
      return (
        <YouRow
          key={item.key}
          kind="toggle"
          icon={icon}
          label={item.label}
          subtitle={keepPhotosText(keep).subtitle}
          on={keep}
          disabled={!user || keepPhotos.isPending}
          onPress={() => keepPhotos.mutate(!keep)}
        />
      );
    }
    if (item.kind === 'action') {
      if (item.key === 'password') {
        return (
          <YouRow
            key={item.key}
            kind="action"
            icon={icon}
            label={item.label}
            subtitle="Enviamos um código para o seu e-mail"
            // O "esqueci minha senha" do Logto, no navegador do sistema.
            onPress={() => void signIn('reset_password')}
          />
        );
      }
      return (
        <YouRow
          key={item.key}
          kind="action"
          icon={icon}
          label={exportData.isPending ? 'Preparando arquivo…' : item.label}
          subtitle={item.detail}
          disabled={exportData.isPending}
          onPress={() => exportData.mutate()}
        />
      );
    }
    if (item.key === 'plan' && !showPlan) return null;
    return (
      <YouRow
        key={item.key}
        icon={icon}
        label={item.label}
        detail={detailOf(item)}
        accessibilityLabel={item.locked ? `${item.label} (exige o plano PRO)` : item.label}
        onPress={() => router.push(item.href as never)}
      />
    );
  };

  return (
    <>
      <Screen onRefresh={handleRefresh} refreshing={refreshing}>
        <View className="gap-6 px-6 pb-6 pt-2">
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Editar perfil e foto"
              onPress={() => router.push('/you/edit')}
            >
              <UserAvatar name={user?.name} url={user?.avatarUrl} size={72} />
              <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-[3px] border-background bg-primary">
                <Icon name="camera" size={14} color={colors.primaryForeground} />
              </View>
            </Pressable>
            <View className="flex-1 gap-1">
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="font-display text-h2 text-foreground"
              >
                {user?.name ?? ''}
              </Text>
              {user ? (
                <Text numberOfLines={1} className="text-xs text-faint">
                  {youHeaderLine(user)}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-2">
                {showPlan && plan.data ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Meu plano: ${plan.data.tier}`}
                    onPress={() => router.push('/plan')}
                    className={
                      plan.data.tier === 'PRO'
                        ? 'rounded-full bg-primary px-2.5 py-0.5'
                        : 'rounded-full bg-muted px-2.5 py-0.5'
                    }
                  >
                    <Text
                      className={
                        plan.data.tier === 'PRO'
                          ? 'font-sans-bold text-xs text-primary-foreground'
                          : 'font-sans-bold text-xs text-foreground'
                      }
                    >
                      {plan.data.tier}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="link"
                  hitSlop={12}
                  onPress={() => router.push('/you/edit')}
                >
                  <Text className="font-sans-bold text-xs text-primary-text">Editar perfil</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Peso atual: ${weightText(today.data?.weight.latest?.weightKg)} kg. Registrar peso`}
              // Abre o registrar peso (Al-G7), como na prancha Al-V1.
              onPress={() => setWeightOpen(true)}
              className="flex-1 basis-0 gap-2 rounded-card bg-card px-[18px] py-4 active:opacity-80"
            >
              <Text className="text-xs text-faint">Peso atual</Text>
              <View className="flex-row items-baseline">
                <Text className="font-display text-[24px] leading-[28px] tracking-[-0.48px] text-foreground">
                  {weightText(today.data?.weight.latest?.weightKg)}
                </Text>
                <Text className="ml-[3px] font-sans-semibold text-[10px] text-muted-foreground">
                  kg
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Estatura: ${user?.heightCm ? Math.round(user.heightCm) : 'sem valor'} cm. Editar`}
              onPress={() => setHeightOpen(true)}
              className="flex-1 basis-0 gap-2 rounded-card bg-card px-[18px] py-4 active:opacity-80"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-faint">Estatura</Text>
                <Icon name="edit" size={16} color={colors.mutedForeground} />
              </View>
              <View className="flex-row items-baseline">
                <Text className="font-display text-[24px] leading-[28px] tracking-[-0.48px] text-foreground">
                  {user?.heightCm ? Math.round(user.heightCm) : '—'}
                </Text>
                <Text className="ml-[3px] font-sans-semibold text-[10px] text-muted-foreground">
                  cm
                </Text>
              </View>
            </Pressable>
          </View>

          {sections.map((section) => (
            <YouSection key={section.title} title={section.title}>
              {section.items.map(renderItem)}
            </YouSection>
          ))}

          <Button variant="outline" size="xl" className="w-full" onPress={confirmSignOut}>
            Sair da conta
          </Button>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/you/delete')}
            className="self-center px-3 py-1"
          >
            <Text className="text-[13px] text-faint underline">Apagar minha conta</Text>
          </Pressable>
          {/* Fora da prancha, mas a App Store pede a política de privacidade
              alcançável de dentro do app (diretriz 5.1.1). */}
          <View className="flex-row justify-center gap-4">
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openLegal('/privacy')}>
              <Text className="text-[13px] text-faint">Privacidade</Text>
            </Pressable>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openLegal('/terms')}>
              <Text className="text-[13px] text-faint">Termos</Text>
            </Pressable>
          </View>
        </View>
      </Screen>

      {/* Folhas fora do `Screen`, como no resto do app: dentro do ScrollView
          elas acompanhariam o conteúdo. */}
      <HeightSheet
        open={heightOpen}
        onOpenChange={setHeightOpen}
        heightCm={user?.heightCm ?? null}
      />
      <BodyLogSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </>
  );
}
