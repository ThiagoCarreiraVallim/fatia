import { Image, Pressable, Text, View } from 'react-native';
import { Dumbbell, Pin, Salad } from 'lucide-react-native';
import {
  planTemplateSummary,
  TIP_CATEGORY_LABEL,
  type GroupTip,
  type PlanTemplate,
} from '@fatia/api-client';
import { cores } from '@/theme/cores';
import { RowChevron, StatusBadge } from './content-ui';
import { MarkdownLite } from './markdown-lite';

/** Cartão de plano pronto, como na web. */
export function TemplateCard({
  template,
  onPress,
  showStatus = false,
}: {
  template: PlanTemplate;
  onPress: () => void;
  showStatus?: boolean;
}) {
  const Icone = template.kind === 'WORKOUT' ? Dumbbell : Salad;
  const resumo = planTemplateSummary(template);
  return (
    <Pressable
      accessibilityRole="link"
      // O leitor de tela lia só o título; o tipo e o estado são o que decide
      // se vale abrir.
      accessibilityLabel={[
        template.title,
        resumo,
        showStatus ? (template.publishedAt ? 'publicado' : 'rascunho') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
    >
      {template.cover?.url ? (
        <Image
          source={{ uri: template.cover.url }}
          accessibilityIgnoresInvertColors
          className="h-16 w-16 rounded-xl"
        />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-xl bg-muted">
          <Icone size={24} color={cores.mutedForeground} />
        </View>
      )}
      <View className="flex-1 gap-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
          {template.title}
        </Text>
        <Text className="text-xs text-muted-foreground">{resumo}</Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {`Por ${template.authorName}`}
        </Text>
        {/* Selo de contorno, embaixo: o pílula verde cheio ao lado do título
            tinha a cara do botão primário e atraía o toque. */}
        {showStatus ? <StatusBadge published={Boolean(template.publishedAt)} /> : null}
      </View>
      <RowChevron />
    </Pressable>
  );
}

/** Dica inteira, como o membro lê. */
export function TipCard({ tip }: { tip: GroupTip }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      {tip.image?.url ? (
        <Image
          source={{ uri: tip.image.url }}
          accessibilityIgnoresInvertColors
          className="aspect-video w-full rounded-xl"
        />
      ) : null}
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          {tip.pinned ? (
            <View className="flex-row items-center gap-1">
              <Pin size={14} color={cores.primary} />
              <Text className="text-xs font-semibold text-primary">Fixada</Text>
            </View>
          ) : null}
          <Text className="text-xs text-muted-foreground">
            {`${TIP_CATEGORY_LABEL[tip.category]} · ${tip.authorName}`}
          </Text>
        </View>
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {tip.title}
        </Text>
      </View>
      <MarkdownLite source={tip.body} />
    </View>
  );
}
