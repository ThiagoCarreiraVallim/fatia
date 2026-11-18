import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, ScanLine } from 'lucide-react-native';
import {
  communityCardBadges,
  communityCardMeta,
  groupsApi,
  PRO_PAID_BADGE,
  type CommunityBadge,
  type MyGroup,
} from '@fatia/api-client';
import { JoinByCodeDrawer } from '@/components/community/join-by-code-drawer';
import { GroupAvatar } from '@/components/community/group-avatar';
import { Screen } from '@/components/layout/screen';
import { HeaderButton, TabHeader } from '@/components/layout/tab-header';
import { Button, DrawerLayer, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { brandColors } from '@/components/ui/ds-math';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

const BADGE_VARIANT: Record<CommunityBadge['tone'], 'pro-community' | 'pending' | 'done'> = {
  team: 'pro-community',
  muted: 'pending',
  ok: 'done',
};

function Badges({ g }: { g: MyGroup }) {
  const badges = communityCardBadges(g);
  if (badges.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {badges.map((b) => (
        <Badge key={b.label} variant={BADGE_VARIANT[b.tone]}>
          {b.label}
        </Badge>
      ))}
    </View>
  );
}

/** Patrocinada: capa na cor da comunidade, avatar sobre a capa, selo do PRO no alto. */
function SponsoredCard({ g, onPress }: { g: MyGroup; onPress: () => void }) {
  const brand = brandColors(null);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={g.name}
      onPress={onPress}
      className="overflow-hidden rounded-card bg-card active:opacity-80"
    >
      <View style={{ height: 92, backgroundColor: brand.background }}>
        {g.proPaidByThisGroup ? (
          <View className="absolute right-3 top-3">
            <Badge variant="pro">{PRO_PAID_BADGE}</Badge>
          </View>
        ) : null}
      </View>
      <View className="-mt-7 px-[18px]">
        <View className="self-start rounded-[20px] border-4 border-card bg-card">
          <GroupAvatar name={g.name} url={g.avatarUrl} size={56} brand />
        </View>
      </View>
      <View className="gap-3 px-[18px] pb-[18px] pt-2">
        <View>
          <Text className="font-display text-h3 text-foreground">{g.name}</Text>
          <Text className="text-xs text-muted-foreground">{communityCardMeta(g)}</Text>
        </View>
        <Badges g={g} />
      </View>
    </Pressable>
  );
}

/** Social (ou pedido pendente): uma linha. */
function RowCard({ g, onPress }: { g: MyGroup; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={g.name}
      onPress={onPress}
      className="min-h-[64px] flex-row items-center gap-3 rounded-[20px] bg-card px-[18px] py-3.5 active:opacity-80"
    >
      <GroupAvatar name={g.name} url={g.avatarUrl} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
          {g.name}
        </Text>
        <Text className="text-xs text-muted-foreground">{communityCardMeta(g)}</Text>
        <Badges g={g} />
      </View>
      {g.proPaidByThisGroup ? <Badge variant="pro">PRO</Badge> : null}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * Minhas comunidades (Cm-01), espelho de `apps/web/src/app/(app)/community/page.tsx`.
 * `?join=1` (o "Tenho código" do plano e do chat) abre a folha; com `&code=`
 * (o link do QR aberto pelo sistema), já procura o código.
 */
export default function CommunityScreen() {
  const router = useRouter();
  const { join, code } = useLocalSearchParams<{ join?: string; code?: string }>();
  const [joining, setJoining] = useState(join === '1' || !!code);
  const groups = useQuery({ queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() });
  const open = (g: MyGroup) => router.push(`/community/${g.id}`);

  return (
    <>
      <Screen onRefresh={() => void groups.refetch()} refreshing={groups.isRefetching}>
        <View className="gap-4 px-5 pb-4 pt-2">
          <TabHeader title="Comunidade">
            <HeaderButton label="Ler QR Code ou digitar código" onPress={() => setJoining(true)}>
              <ScanLine size={20} color={colors.foreground} />
            </HeaderButton>
            <HeaderButton
              label="Criar comunidade"
              variant="lime"
              onPress={() => router.push('/community/new')}
            >
              <Plus size={20} color={colors.primaryForeground} />
            </HeaderButton>
          </TabHeader>
          {groups.isPending ? <LoadingState label="Carregando suas comunidades…" /> : null}
          {groups.isError ? (
            <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
          ) : null}
          {groups.data && groups.data.length === 0 ? (
            <EmptyState
              title="Suas comunidades aparecem aqui"
              description="Entre pelo QR da recepção, pelo convite ou pelo código que sua academia ou treinador divulgou, e escolha o que compartilhar."
            />
          ) : null}
          {groups.data && groups.data.length > 0 ? (
            <View className="gap-3">
              {groups.data.map((g) =>
                g.type === 'SPONSORED' && g.status === 'ACTIVE' ? (
                  <SponsoredCard key={g.id} g={g} onPress={() => open(g)} />
                ) : (
                  <RowCard key={g.id} g={g} onPress={() => open(g)} />
                ),
              )}
            </View>
          ) : null}

          <View className="gap-2.5 rounded-card bg-surface-3 p-4">
            <Text className="font-sans-bold text-foreground">Entrar numa comunidade</Text>
            <Text className="text-xs text-muted-foreground">
              Leia o QR Code da recepção ou digite o código que sua academia ou treinador divulgou.
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button size="sm" onPress={() => setJoining(true)}>
                  Ler QR ou código
                </Button>
              </View>
              <Button size="sm" variant="outline" onPress={() => router.push('/community/new')}>
                Criar
              </Button>
            </View>
          </View>
        </View>
      </Screen>

      {/* Sem a camada o sheet não tem onde abrir e fica invisível (ver `ui/drawer.tsx`). */}
      <DrawerLayer>
        <JoinByCodeDrawer
          open={joining}
          onOpenChange={(o) => {
            setJoining(o);
            if (!o && (join || code)) router.setParams({ join: undefined, code: undefined });
          }}
          initialCode={code ?? null}
          onJoined={(groupId) => router.push(`/community/${groupId}`)}
        />
      </DrawerLayer>
    </>
  );
}
