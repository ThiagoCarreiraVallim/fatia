import { useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  benefitCopiedToast,
  benefitExpiredNote,
  benefitInitials,
  benefitsApi,
  benefitValidity,
  BENEFITS_PRIVACY_NOTE,
  groupsApi,
  type MemberBenefit,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';

/** Cupom em fonte de largura fixa, como na prancha: 0 e O não se confundem. */
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Monograma neutro: o parceiro não é a academia, então não leva a cor dela (Cm-22). */
function Logo({ b }: { b: MemberBenefit }) {
  if (b.logoUrl) {
    return (
      <Image
        source={{ uri: b.logoUrl }}
        accessibilityIgnoresInvertColors
        style={{ width: 48, height: 48, borderRadius: 14 }}
      />
    );
  }
  return (
    <View className="h-12 w-12 items-center justify-center rounded-[14px] bg-surface-3">
      <Text className="font-display text-sm text-foreground">{benefitInitials(b.partnerName)}</Text>
    </View>
  );
}

/**
 * Benefícios (Cm-22), espelho de
 * `apps/web/src/app/(app)/community/[groupId]/benefits/page.tsx`: cupom copia
 * (`expo-clipboard`), link abre no navegador do sistema, vencido apagado e sem ação.
 */
export default function CommunityBenefitsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const list = useQuery({
    queryKey: ['community', 'benefits', groupId],
    queryFn: () => benefitsApi.list(groupId),
  });

  async function copy(b: MemberBenefit) {
    if (!b.couponCode) return;
    await Clipboard.setStringAsync(b.couponCode);
    setCopied(b.id);
    toast.show({ message: benefitCopiedToast(b.couponCode) });
  }

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching}>
      <View className="gap-4 px-5 pb-4 pt-4">
        {/* O título já está na barra do topo; aqui fica só a frase (Cm-22). */}
        <Text className="px-1 text-sm text-muted-foreground">
          {group.data
            ? `Descontos que a ${group.data.name} combinou com parceiros.`
            : 'Descontos que a comunidade combinou com parceiros.'}
        </Text>

        {list.isPending ? <LoadingState label="Carregando os benefícios…" /> : null}
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : null}
        {list.data && list.data.length === 0 ? (
          <EmptyState
            title="Nenhum benefício agora"
            description="Quando a comunidade combinar um desconto com um parceiro, ele aparece aqui."
          />
        ) : null}
        {list.data?.map((b) => (
          <View
            key={b.id}
            accessibilityLabel={b.partnerName}
            className="gap-3 rounded-card bg-card p-[18px]"
          >
            <View className="flex-row items-center gap-3">
              {/* Vencido: apaga só logo e título; selo e nota ficam com contraste cheio. */}
              <View
                className={cn(
                  'min-w-0 flex-1 flex-row items-center gap-3',
                  b.expired && 'opacity-50',
                )}
              >
                <Logo b={b} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-sans-bold text-foreground">
                    {b.partnerName}
                  </Text>
                  <Text className="text-sm text-muted-foreground">{b.discountText}</Text>
                </View>
              </View>
              <Badge variant={b.expired ? 'pending' : 'done'}>{benefitValidity(b)}</Badge>
            </View>
            {b.expired ? (
              <Text className="text-xs text-muted-foreground">{benefitExpiredNote(b)}</Text>
            ) : b.kind === 'COUPON' && b.couponCode ? (
              <View className="flex-row items-center gap-2">
                <View className="h-11 flex-1 justify-center rounded-xl border border-dashed border-border px-3">
                  <Text
                    selectable
                    style={{ fontFamily: MONO }}
                    className="text-sm font-bold tracking-wider text-foreground"
                  >
                    {b.couponCode}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant={copied === b.id ? 'outline' : 'brand'}
                  onPress={() => void copy(b)}
                >
                  {copied === b.id ? 'Copiado' : 'Copiar código'}
                </Button>
              </View>
            ) : b.url ? (
              <Button variant="brand" onPress={() => void Linking.openURL(b.url!)}>
                Visitar o site
              </Button>
            ) : null}
          </View>
        ))}

        <Text className="px-1 text-xs text-muted-foreground">{BENEFITS_PRIVACY_NOTE}</Text>
      </View>
    </Screen>
  );
}
