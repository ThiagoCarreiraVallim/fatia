import { Image, Pressable, View } from 'react-native';
import { Apple, Dumbbell, Pin } from 'lucide-react-native';
import {
  gymEquipmentLabels,
  markdownLitePlainText,
  memberTemplateLine,
  tipEyebrow,
  type GroupExercise,
  type GroupTip,
  type GymEquipmentState,
  type PlanTemplate,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { colors } from '@/theme/colors';
import { RowChevron } from './content-ui';

/**
 * As peças da aba Conteúdo do membro (Cm-12, #396), equivalente de
 * `apps/web/src/components/content/member-content.tsx`. A bancada da equipe
 * continua com `content-cards.tsx`.
 */

const ROW = 'min-h-[44px] flex-row items-center gap-3 rounded-[18px] bg-card p-3 active:opacity-80';

/** Plano na lista: o ícone do tipo, o título e "treino · 4 exercícios · intermediário · Bruno". */
export function MemberTemplateRow({
  template,
  onPress,
}: {
  template: PlanTemplate;
  onPress: () => void;
}) {
  const treino = template.kind === 'WORKOUT';
  const Icone = treino ? Dumbbell : Apple;
  const linha = memberTemplateLine(template);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${template.title}, ${linha}`}
      onPress={onPress}
      className={ROW}
    >
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-xl',
          treino ? 'bg-primary/15' : 'bg-warning/15',
        )}
      >
        <Icone size={20} color={treino ? colors.primaryText : colors.warning} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
          {template.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {linha}
        </Text>
      </View>
      <RowChevron />
    </Pressable>
  );
}

/** Dica na lista: "Fixada · hábitos", o título e o começo do texto. Abre a dica inteira. */
export function MemberTipCard({ tip, onPress }: { tip: GroupTip; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${tip.title}, ${tipEyebrow(tip)}`}
      onPress={onPress}
      className="gap-1.5 rounded-2xl bg-card p-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-1.5">
        {tip.pinned ? <Pin size={14} color={colors.primaryText} /> : null}
        <Text
          className={cn('text-xs', tip.pinned ? 'font-bold text-primary' : 'text-muted-foreground')}
        >
          {tipEyebrow(tip)}
        </Text>
      </View>
      <Text className="font-semibold text-foreground">{tip.title}</Text>
      <Text numberOfLines={2} className="text-xs text-muted-foreground">
        {markdownLitePlainText(tip.body)}
      </Text>
    </Pressable>
  );
}

/** "pernas · máquina · guia da academia". */
export function guideLine(e: Pick<GroupExercise, 'muscleGroup' | 'equipment'>): string {
  return [e.muscleGroup, e.equipment, 'guia da academia'].filter(Boolean).join(' · ');
}

/** Guia na lista: a primeira foto (ou o ícone), o nome e a linha do guia. */
export function GuideRow({ guide, onPress }: { guide: GroupExercise; onPress: () => void }) {
  const foto = guide.photos[0]?.url;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${guide.name}, ${guideLine(guide)}`}
      onPress={onPress}
      className={ROW}
    >
      {foto ? (
        <Image
          source={{ uri: foto }}
          accessibilityIgnoresInvertColors
          className="h-[52px] w-[52px] rounded-[14px]"
        />
      ) : (
        <View className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-muted">
          <Dumbbell size={20} color={colors.mutedForeground} />
        </View>
      )}
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
          {guide.name}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {guideLine(guide)}
        </Text>
      </View>
      <RowChevron />
    </Pressable>
  );
}

/** "Equipamentos da academia": o que ela tem, em fichas, só para ler. */
export function GymEquipmentCard({ state }: { state: GymEquipmentState }) {
  const itens = gymEquipmentLabels(state);
  if (!itens.length) return null;
  return (
    <View accessibilityLabel="Equipamentos da academia" className="gap-2 rounded-2xl bg-muted p-3">
      <Text
        accessibilityRole="header"
        className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        Equipamentos da academia
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {itens.map((e) => (
          <View key={e} className="rounded-full border border-border px-3 py-1">
            <Text className="text-xs text-foreground">{e}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
