import { useState } from 'react';
import { View } from 'react-native';
import {
  SHARE_TARGETS,
  shareIdentityOptions,
  type ShareIdentityOption,
  type ShareTarget,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerHeader, DrawerScrollView, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/selection';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { ShareCard, type ShareCardData, type ShareIdentity } from './share-card';

function toIdentity(o: ShareIdentityOption): ShareIdentity {
  return o.as === 'none' ? { as: 'none' } : { as: o.as, value: o.value };
}

/**
 * Folha "Compartilhar" (prancha Componentes-plano · 1.5), espelho do
 * `share-sheet.tsx` da web: prévia do cartão, "Aparecer como" (nome, @ ou
 * ninguém) e Stories/WhatsApp/Salvar. Monta dentro de um `DrawerLayer`.
 */
export function ShareSheet({
  open,
  onOpenChange,
  data,
  person,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShareCardData;
  person: { name: string; handle: string | null };
  onShare: (target: ShareTarget, identity: ShareIdentity) => void;
}) {
  const options = shareIdentityOptions(person);
  const [as, setAs] = useState<ShareIdentityOption['as']>(options[0]!.as);
  const chosen = options.find((o) => o.as === as) ?? options[0]!;
  const identity = toIdentity(chosen);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, gap: 16 }}
      >
        <DrawerHeader className="px-5">
          <DrawerTitle>Compartilhar</DrawerTitle>
        </DrawerHeader>
        <View className="items-center px-5">
          <ShareCard data={data} identity={identity} className="max-w-[220px]" />
        </View>
        <View className="flex-row items-center justify-between gap-3 px-5">
          <Text className="text-b2 text-muted-foreground">Aparecer como</Text>
          <Segmented
            label="Aparecer como"
            value={as}
            onChange={setAs}
            options={options.map((o) => ({ value: o.as, label: o.label }))}
          />
        </View>
        <View className="flex-row gap-2 px-5">
          {SHARE_TARGETS.map((t) => (
            <Button
              key={t.key}
              variant="secondary"
              className="flex-1"
              accessibilityLabel={t.label}
              onPress={() => onShare(t.key, identity)}
            >
              <Icon name={t.icon} size={16} color={colors.foreground} />
              <Text className="font-sans-semibold text-sm text-secondary-foreground">
                {t.label}
              </Text>
            </Button>
          ))}
        </View>
      </DrawerScrollView>
    </Drawer>
  );
}
