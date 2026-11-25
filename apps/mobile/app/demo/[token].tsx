import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  DEMO_BANNER_TITLE,
  demoSessionRequest,
  greetingLine,
  isDemoSessionToken,
  type MeUser,
  type TodaySummary,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  KcalCard,
  NextWorkoutCard,
  StepsTile,
  StreakTile,
  WaterTile,
  WeightTile,
} from '@/components/today/today-cards';
import { env } from '@/env';
import { colors } from '@/theme/colors';

/**
 * "Abrir no app como Ana Exemplo" (#412): o Hoje da aluna fictícia, só leitura.
 *
 * Equivalente de `apps/web/src/app/(demo)/demo/[token]/page.tsx`, aberto por
 * `fatia://demo/<token>` ou pelo link universal. Fora do `(app)`: não usa a
 * sessão de quem está logado no app (pode ser a conta pessoal da dona), só o
 * token curto da demo, e só nas rotas do Hoje (`demoSessionRequest`). Os
 * cartões são os do Hoje, sem toque: os links deles levariam à conta de quem
 * está logado, não à da Ana.
 */

class DemoExpired extends Error {}

async function demoGet<T>(token: string, route: string): Promise<T> {
  const req = demoSessionRequest(env.apiUrl, token, route);
  if (!req) throw new DemoExpired();
  const res = await fetch(req.url, req.init);
  if (res.status === 401 || res.status === 403) throw new DemoExpired();
  if (!res.ok) throw new Error(`demo ${route}: ${res.status}`);
  return (await res.json()) as T;
}

const noop = () => undefined;

const VENCIDO = 'O link vale por 30 minutos. Abra de novo pelo painel, em Demonstração.';

export default function DemoSessionScreen() {
  const { token: bruto } = useLocalSearchParams<{ token: string }>();
  const token = isDemoSessionToken(bruto) ? bruto : null;

  const me = useQuery({
    queryKey: ['demo-session', token, 'me'],
    queryFn: () => demoGet<Pick<MeUser, 'id' | 'name'>>(token!, 'users/me'),
    enabled: token !== null,
    retry: false,
  });
  const today = useQuery({
    queryKey: ['demo-session', token, 'today'],
    queryFn: () => demoGet<TodaySummary>(token!, 'dashboard/today'),
    enabled: token !== null,
    retry: false,
  });

  const vencido =
    token === null || me.error instanceof DemoExpired || today.error instanceof DemoExpired;
  const data = today.data;

  return (
    <Screen title="Demonstração">
      <View className="gap-4 px-5 pt-2 pb-8">
        <View className="flex-row items-start gap-3 rounded-card border border-warning/45 bg-warning/10 px-4 py-3">
          <Icon name="eye" size={18} color={colors.primary} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-primary">{DEMO_BANNER_TITLE}</Text>
            <Text className="text-[13px] text-muted-foreground">
              É assim que a aluna vê o Hoje. É só leitura: nada é gravado e ninguém recebe aviso.
            </Text>
          </View>
        </View>

        {vencido ? (
          <EmptyState title="O link da demonstração venceu" description={VENCIDO} />
        ) : me.isError || today.isError ? (
          <ErrorState
            error={me.error ?? today.error}
            onRetry={() => {
              void me.refetch();
              void today.refetch();
            }}
          />
        ) : !data || !me.data ? (
          <LoadingState label="Abrindo a demonstração…" />
        ) : (
          <>
            <Text accessibilityRole="header" className="font-display text-[26px] text-foreground">
              {greetingLine(me.data.name)}
            </Text>
            <View pointerEvents="none" className="gap-4">
              <KcalCard nutrition={data.nutrition} />
              <NextWorkoutCard workout={data.workout} />
              <View className="flex-row gap-3">
                <WaterTile water={data.water} onOpen={noop} onAdd={noop} adding={false} />
                <StepsTile steps={data.steps} onOpen={noop} />
              </View>
              <View className="flex-row gap-3">
                <WeightTile weight={data.weight} onOpen={noop} />
                <StreakTile streak={data.streak} />
              </View>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
