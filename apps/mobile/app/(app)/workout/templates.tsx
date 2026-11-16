import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Dumbbell } from 'lucide-react-native';
import {
  initialsOf,
  templatesSubtitle,
  workoutTemplatesApi,
  type WorkoutTemplateItem,
  type WorkoutTemplatesGroup,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, Chip, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * Modelos das comunidades (#379, prancha Al-T23). Réplica de
 * `apps/web/src/app/(app)/workout/templates/page.tsx`: os planos de treino
 * publicados nas comunidades da pessoa, por comunidade. Tocar abre o detalhe
 * do modelo, onde fica o "Adotar".
 */

/** Função, não constante: os tokens de cor são getters do tema claro/escuro. */
const levelColor = (level: string | null) =>
  level === 'beginner'
    ? colors.primaryText
    : level === 'intermediate'
      ? colors.steps
      : level === 'advanced'
        ? colors.danger
        : colors.faintForeground;

/** O quadrado do ícone na cor do nível (prancha: chipic colorido). */
const levelChipBg = (level: string | null) =>
  level === 'beginner'
    ? `${colors.primary}26`
    : level === 'intermediate'
      ? `${colors.steps}26`
      : level === 'advanced'
        ? `${colors.danger}26`
        : colors.muted;

export default function WorkoutTemplatesScreen() {
  const router = useRouter();
  const [groupId, setGroupId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['groups', 'templates', 'mine'],
    queryFn: () => workoutTemplatesApi.listMine(),
  });
  const groups = (q.data ?? []).filter((g) => g.templates.length > 0);
  const shown = groupId ? groups.filter((g) => g.group.id === groupId) : groups;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View className="gap-4 pt-2">
        {groups.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-5"
          >
            <Chip label="Todas" selected={groupId === null} onPress={() => setGroupId(null)} />
            {groups.map((g) => (
              <Chip
                key={g.group.id}
                label={g.group.name}
                selected={groupId === g.group.id}
                onPress={() => setGroupId(g.group.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        <View className="gap-5 px-5">
          {q.isLoading ? <LoadingState /> : null}
          {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
          {q.data && groups.length === 0 ? (
            <EmptyState
              title="Nenhum modelo nas suas comunidades"
              description="Quando a equipe de uma comunidade publicar um plano de treino, ele aparece aqui."
              action={
                <Button
                  variant="secondary"
                  size="xs"
                  onPress={() => router.push('/community' as Href)}
                >
                  Ver comunidades
                </Button>
              }
            />
          ) : null}

          {shown.map((g) => (
            <GroupSection
              key={g.group.id}
              group={g}
              onOpen={(t) => router.push(`/community/${g.group.id}/content/${t.id}` as Href)}
            />
          ))}

          {groups.length > 0 ? (
            <Text className="pb-4 text-xs text-faint">
              Ao adotar, você recebe uma cópia nos seus planos. O original da comunidade não muda.
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function GroupSection({
  group: g,
  onOpen,
}: {
  group: WorkoutTemplatesGroup;
  onOpen: (t: WorkoutTemplateItem) => void;
}) {
  const n = g.templates.length;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2.5">
        <View
          className="h-7 w-7 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: colors.brand }}
        >
          <Text
            className="font-sans-extrabold text-[11px]"
            style={{ color: colors.brandForeground }}
          >
            {initialsOf(g.group.name)}
          </Text>
        </View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 font-sans-bold text-[15px] text-foreground"
        >
          {g.group.name}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {n} {n === 1 ? 'modelo' : 'modelos'}
        </Text>
      </View>
      <View className="overflow-hidden rounded-card bg-card px-4">
        {g.templates.map((t, i) => {
          const sub = templatesSubtitle(t);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="link"
              accessibilityLabel={[t.title, sub.level, sub.rest, t.adoptedPlanId ? 'adotado' : null]
                .filter(Boolean)
                .join(', ')}
              onPress={() => onOpen(t)}
              className={cn(
                'min-h-16 flex-row items-center gap-3 py-3 active:opacity-80',
                i > 0 && 'border-t border-border',
              )}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-[12px]"
                style={{ backgroundColor: levelChipBg(t.level) }}
              >
                <Dumbbell size={16} color={levelColor(t.level)} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-sans-semibold text-[15px] text-foreground">
                  {t.title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                  {sub.level ? (
                    <Text className="font-sans-bold text-xs" style={{ color: levelColor(t.level) }}>
                      {sub.level} ·{' '}
                    </Text>
                  ) : null}
                  {sub.rest}
                </Text>
              </View>
              {t.adoptedPlanId ? (
                <View
                  className="h-[22px] justify-center rounded-pill px-2"
                  style={{ backgroundColor: `${colors.primary}1f` }}
                >
                  <Text className="font-sans-extrabold text-[11px] text-primary">adotado</Text>
                </View>
              ) : null}
              <ChevronRight size={16} color={colors.faintForeground} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
