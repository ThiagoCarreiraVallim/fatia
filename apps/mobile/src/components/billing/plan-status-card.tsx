import { Linking, View } from 'react-native';
import {
  PRO_BENEFITS,
  type PlanAction,
  type PlanStatusView,
  type PlanTone,
} from '@fatia/api-client';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

/** O contorno do cartão, como nas pranchas (Al-M13, Al-M13b). */
const OUTLINE = {
  info: 'border-info/60',
  warn: 'border-warning/60',
  danger: 'border-danger/60',
} as const;

const BADGE: Record<PlanTone, BadgeVariant> = {
  pro: 'pro',
  trial: 'trial',
  warn: 'lite',
  mute: 'pending',
  free: 'free',
};

/**
 * O cartão do plano no app (pranchas Al-M13, Al-M13d e Al-M5). O texto e os
 * botões vêm de `planStatusView` com `surface: 'app'`, que nunca devolve
 * pagamento fora da loja: aqui só há "abrir assinaturas da loja", "Tenho
 * código", "Abrir a IA" e "Voltar ao PRO" (que leva à oferta da loja).
 */
export function PlanStatusCard({
  view,
  highlight,
  onAction,
}: {
  view: PlanStatusView;
  /** O recurso que trouxe a pessoa ao plano (`?recurso=foto`). */
  highlight?: string;
  onAction: (action: PlanAction) => void;
}) {
  return (
    <View className="gap-4">
      {view.community ? <CommunityCard view={view} /> : null}

      <View
        className={cn(
          'gap-3 rounded-card bg-card p-5',
          view.outline && 'border-[1.5px]',
          view.outline && OUTLINE[view.outline],
        )}
      >
        <View className="flex-row items-center gap-2">
          <Badge
            variant={view.community && view.tone === 'pro' ? 'pro-community' : BADGE[view.tone]}
          >
            {view.badge}
          </Badge>
          {view.via ? (
            <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">
              {view.via}
            </Text>
          ) : null}
        </View>
        {view.community ? null : (
          <Text accessibilityRole="header" className="font-display text-xl text-foreground">
            {view.title}
          </Text>
        )}
        <Text className="text-sm text-muted-foreground">{view.body}</Text>
        {view.actions.map((a, i) => (
          <Button
            key={a.kind}
            variant={
              i > 0 || a.label.startsWith('Cancelar')
                ? // "Cancelar nas assinaturas da loja" não é a ação principal (Al-M13).
                  'outline'
                : view.community
                  ? 'brand'
                  : 'default'
            }
            onPress={() => (a.kind === 'store' ? void Linking.openURL(a.url) : onAction(a))}
          >
            {a.label}
          </Button>
        ))}
        {view.note ? (
          <Text className="text-center text-xs text-muted-foreground">{view.note}</Text>
        ) : null}
      </View>

      {view.why ? (
        <View className="gap-1 rounded-card bg-card p-4">
          <Text className="font-sans-semibold text-sm text-foreground">{view.why.title}</Text>
          <Text className="text-xs text-muted-foreground">{view.why.body}</Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="px-1 font-sans-bold text-xs uppercase tracking-wider text-muted-foreground">
          {view.featuresTitle}
        </Text>
        <View className="overflow-hidden rounded-card bg-card">
          {PRO_BENEFITS.map((b, i) => (
            <View
              key={b.key}
              className={cn(
                'flex-row items-center gap-3 px-4 py-3',
                i < PRO_BENEFITS.length - 1 && 'border-b border-border',
                highlight === b.key && 'bg-primary/10',
              )}
            >
              <Icon
                name={view.featuresOn ? 'check' : 'lock'}
                size={18}
                color={view.featuresOn ? colors.primaryText : colors.mutedForeground}
              />
              <View className="flex-1">
                <Text className="font-sans-semibold text-base text-foreground">{b.title}</Text>
                <Text className="text-xs text-muted-foreground">{b.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Al-M5: o cartão laranja da comunidade, com quem paga, até quando e o programa. */
function CommunityCard({ view }: { view: PlanStatusView }) {
  const c = view.community!;
  return (
    <View className="gap-3 rounded-card bg-brand p-5">
      <View className="h-10 w-10 items-center justify-center rounded-field bg-brand-foreground/15">
        <Icon name="users" size={20} color={colors.brandForeground} />
      </View>
      <Text accessibilityRole="header" className="font-display text-2xl text-brand-foreground">
        {c.title}
      </Text>
      <Text className="font-sans-semibold text-[13px] text-brand-foreground/80">{c.until}</Text>
      {c.program ? (
        <View className="flex-row items-center gap-3 rounded-field bg-brand-foreground/15 px-4 py-3">
          <Icon name="cal" size={18} color={colors.brandForeground} />
          <View className="flex-1">
            <Text className="font-sans-semibold text-sm text-brand-foreground">
              PRO até {c.program.until}
            </Text>
            <Text className="text-xs text-brand-foreground/80">
              {c.program.name} · faltam {c.program.daysLeft}{' '}
              {c.program.daysLeft === 1 ? 'dia' : 'dias'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
