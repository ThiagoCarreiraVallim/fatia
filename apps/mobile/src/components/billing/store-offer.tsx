import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { storeTermsText } from '@fatia/api-client';
import { storeOption, storeTrialDays, type StorePackageLike } from '@/billing/plan-offer';
import { openLegal } from '@/components/profile/legal';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

const TILES = [
  { icon: 'chat', label: 'Conversa' },
  { icon: 'camera', label: 'Foto do prato' },
  { icon: 'mic', label: 'Voz' },
] as const;

/** O ícone num quadrado verde-claro, o `chipic lime` das pranchas. */
function IconChip({ name }: { name: 'chat' | 'camera' | 'mic' | 'users' }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-field bg-primary/15">
      <Icon name={name} size={20} color={colors.primaryText} />
    </View>
  );
}

/** "Registro manual, metas e MCP seguem grátis", com o check da prancha. */
function FreeStaysLine() {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="check" size={16} color={colors.primaryText} />
      <Text className="flex-1 text-xs text-muted-foreground">
        Registro manual, metas e MCP seguem grátis
      </Text>
    </View>
  );
}

/** "Deixe a IA registrar por você" e os três jeitos (Al-M2, Al-M1). */
export function ProHero() {
  return (
    <View className="gap-4">
      <Text
        accessibilityRole="header"
        className="font-display text-[32px] leading-[36px] text-foreground"
      >
        Deixe a IA registrar por você
      </Text>
      <View className="flex-row gap-2">
        {TILES.map((t) => (
          <View key={t.label} className="flex-1 items-center gap-2 rounded-card bg-card px-2 py-4">
            <IconChip name={t.icon} />
            <Text className="text-center font-sans-semibold text-[13px] text-foreground">
              {t.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function LegalLinks() {
  return (
    <View className="flex-row justify-center gap-2">
      <Text
        accessibilityRole="link"
        onPress={() => openLegal('/terms')}
        className="text-xs text-muted-foreground underline"
      >
        Termos de uso
      </Text>
      <Text className="text-xs text-muted-foreground">·</Text>
      <Text
        accessibilityRole="link"
        onPress={() => openLegal('/privacy')}
        className="text-xs text-muted-foreground underline"
      >
        Privacidade
      </Text>
    </View>
  );
}

/**
 * A oferta da loja (Al-M2) e o início do teste (Al-M3). Os preços e o teste
 * são os da loja (`PurchasesPackage`), nunca os da web: no app só se compra
 * pela App Store ou pelo Google Play. O teste só é prometido quando a loja tem
 * a oferta grátis no pacote **e** a pessoa ainda não usou o teste no Fatia.
 */
export function StoreOffer<P extends StorePackageLike>({
  packages,
  trialEligible,
  buying,
  onBuy,
  onTrial,
  onRestore,
  restoring,
  onCode,
  onLater,
}: {
  packages: P[];
  trialEligible: boolean;
  buying: boolean;
  onBuy: (pkg: P) => void;
  /** Com teste: abre o Al-M3 (a folha `TrialDrawer`, na camada da tela). */
  onTrial: (trial: { pkg: P; days: number; price: string }) => void;
  onRestore: () => void;
  restoring: boolean;
  onCode: () => void;
  onLater: () => void;
}) {
  const options = packages
    .map((p) => ({ pkg: p, opt: storeOption(p) }))
    .filter((o): o is { pkg: P; opt: NonNullable<ReturnType<typeof storeOption>> } => !!o.opt)
    // O anual primeiro, como na prancha.
    .sort((a, b) => Number(b.opt.interval === 'YEARLY') - Number(a.opt.interval === 'YEARLY'));
  const [picked, setPicked] = useState(0);
  const chosen = options[picked] ?? options[0];
  if (!chosen) {
    return (
      <Text className="text-center text-sm text-muted-foreground">
        Não foi possível carregar os planos da loja agora.
      </Text>
    );
  }
  const trialDays = trialEligible ? storeTrialDays(chosen.pkg) : 0;
  const terms = storeTermsText({
    trialDays,
    price: chosen.opt.price,
    interval: chosen.opt.interval,
  });
  const cta = trialDays > 0 ? `Começar ${trialDays} dias grátis` : 'Assinar PRO';

  return (
    <View className="gap-4">
      <View className="gap-2" accessibilityRole="radiogroup">
        {options.map(({ pkg, opt }, i) => (
          <Pressable
            key={pkg.identifier}
            accessibilityRole="radio"
            accessibilityState={{ checked: i === picked }}
            accessibilityLabel={`${opt.title}, ${opt.price} ${opt.per}`}
            onPress={() => setPicked(i)}
            className={cn(
              'min-h-[64px] flex-row items-center gap-3 rounded-card bg-card px-4 py-3',
              i === picked && 'border-2 border-primary',
            )}
          >
            <View
              className={cn(
                'h-5 w-5 items-center justify-center rounded-full border-2',
                i === picked ? 'border-primary bg-primary' : 'border-border-strong',
              )}
            >
              {i === picked ? (
                <Icon name="check" size={12} color={colors.primaryForeground} />
              ) : null}
            </View>
            <View className="flex-1">
              <Text className="font-sans-semibold text-base text-foreground">{opt.title}</Text>
              <Text className="text-xs text-muted-foreground">{opt.per}</Text>
            </View>
            <Text className="font-display text-lg text-foreground">{opt.price}</Text>
          </Pressable>
        ))}
      </View>

      <FreeStaysLine />

      <View className="gap-2">
        <Button
          size="xl"
          loading={buying}
          onPress={() =>
            trialDays > 0
              ? onTrial({
                  pkg: chosen.pkg,
                  days: trialDays,
                  price: `${chosen.opt.price} ${chosen.opt.interval === 'YEARLY' ? 'por ano' : 'por mês'}`,
                })
              : onBuy(chosen.pkg)
          }
        >
          {cta}
        </Button>
        <Text className="text-center text-xs text-muted-foreground">{terms}</Text>
        <LegalLinks />
        <Button variant="text" onPress={onCode}>
          Tenho código
        </Button>
        <Button variant="text" loading={restoring} onPress={onRestore}>
          Restaurar compras
        </Button>
        <Button variant="text" onPress={onLater}>
          Agora não
        </Button>
      </View>
    </View>
  );
}

const DAY_MS = 86_400_000;
const shortDay = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
    .format(d)
    .replace(/\.| de/g, '');

/** Al-M3: o que acontece em cada dia do teste, antes de abrir a folha da loja. */
export function TrialDrawer({
  open,
  onOpenChange,
  days,
  price,
  buying,
  done,
  onStart,
  onOpenAi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: number;
  price: string;
  buying: boolean;
  done: boolean;
  onStart: () => void;
  onOpenAi: () => void;
}) {
  // O dia de hoje, fixo enquanto a folha está montada.
  const [now] = useState(() => Date.now());
  const steps = [
    { when: 'Hoje', what: 'Chat, foto e voz liberados' },
    {
      when: `Dia ${Math.max(1, days - 2)} · ${shortDay(new Date(now + (days - 2) * DAY_MS))}`,
      what: 'Avisamos que o teste está acabando',
    },
    {
      when: `Dia ${days} · ${shortDay(new Date(now + days * DAY_MS))}`,
      what: `A loja cobra ${price}. Cancele antes e não paga nada.`,
    },
  ];
  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <DrawerContent className="flex-1">
        <DrawerHeader>
          <DrawerTitle>{`${days} dias de PRO, sem cobrar nada hoje`}</DrawerTitle>
          <DrawerDescription>Cancele a qualquer momento nas assinaturas da loja.</DrawerDescription>
        </DrawerHeader>
        <View className="gap-4 px-4 py-2">
          {steps.map((s, i) => (
            <View key={s.when} className="flex-row gap-3">
              <View
                className={cn(
                  'mt-1 h-3 w-3 rounded-full',
                  i === 0 ? 'bg-primary' : 'bg-border-strong',
                )}
              />
              <View className="flex-1">
                <Text className="font-sans-semibold text-sm text-foreground">{s.when}</Text>
                <Text className="text-sm text-muted-foreground">{s.what}</Text>
              </View>
            </View>
          ))}
        </View>
        <DrawerFooter className="pb-8">
          <Text className="text-center text-xs text-muted-foreground">
            {`Grátis por ${days} dias, depois ${price}. A assinatura renova sozinha, a menos que você cancele até 24 h antes do fim do período.`}
          </Text>
          <LegalLinks />
          {done ? (
            <Button size="xl" onPress={onOpenAi}>
              PRO ativo · abrir a IA
            </Button>
          ) : (
            <Button size="xl" loading={buying} onPress={onStart}>
              {buying ? 'Confirmando na loja…' : 'Começar teste'}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Al-M2 sem compra no app: o PRO vem pela comunidade, sem preço e sem link. */
export function CommunityOffer({
  text,
  onCode,
  onLater,
}: {
  text: string;
  onCode: () => void;
  onLater: () => void;
}) {
  return (
    <View className="gap-3">
      <View className="gap-3 rounded-card bg-card p-5">
        <IconChip name="users" />
        <Text accessibilityRole="header" className="font-display text-lg text-foreground">
          O PRO vem pela sua comunidade
        </Text>
        <Text className="text-sm text-muted-foreground">{text}</Text>
      </View>
      <FreeStaysLine />
      <Button size="xl" onPress={onCode}>
        Tenho código
      </Button>
      <Button variant="text" onPress={onLater}>
        Agora não
      </Button>
    </View>
  );
}
