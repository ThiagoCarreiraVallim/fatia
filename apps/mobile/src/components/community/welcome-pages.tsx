import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import {
  WELCOME_COPY,
  initialsOf,
  namesLine,
  welcomeCta,
  welcomeLines,
  welcomePageIcon,
  welcomePosition,
  type WelcomePageInput,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon, Text, cn } from '@/components/ui';
import { AVATAR_TONES, Avatar, PrimaryButton } from '@/components/onboarding/onboarding-ui';
import { colors } from '@/theme/colors';

const PLAIN_ICON: Record<ReturnType<typeof welcomePageIcon>, IconName> = {
  users: 'users',
  list: 'list',
  text: 'file',
};

/**
 * As páginas de boas-vindas da comunidade como o aluno vê (Onb-02b, #410), a
 * mesma tela da web: capa com a marca ou página simples, "1 de N", "Pular",
 * voltar e o botão de baixo. O texto é puro: só "- " vira item de lista.
 */
export function WelcomePagesView({
  groupName,
  avatarUrl = null,
  pages,
  team,
  onSkip,
  onFinish,
  onBackFirst,
  note = true,
}: {
  groupName: string;
  avatarUrl?: string | null;
  pages: WelcomePageInput[];
  team: { name: string }[];
  onSkip: () => void;
  onFinish: () => void;
  /** Voltar na primeira página (no onboarding, às boas-vindas do Fatia). */
  onBackFirst?: () => void;
  note?: boolean;
}) {
  const [i, setI] = useState(0);
  const n = pages.length;
  const page = pages[Math.min(i, n - 1)];
  if (!page) return null;
  const cover = page.kind === 'COVER';
  const lines = welcomeLines(page.body);
  const canBack = i > 0 || Boolean(onBackFirst);

  const dots = (
    <View className="flex-row gap-1.5">
      {pages.map((_, d) => (
        <View
          key={d}
          className={cn(
            'h-1 flex-1 rounded-[2px]',
            d <= i
              ? cover
                ? 'bg-brand-foreground'
                : 'bg-brand'
              : cover
                ? 'bg-brand-foreground/30'
                : 'bg-surface-3',
          )}
        />
      ))}
    </View>
  );
  const skip = (
    <Pressable
      accessibilityRole="button"
      onPress={onSkip}
      hitSlop={8}
      className="min-h-11 justify-center px-1"
    >
      <Text
        className={cn(
          'text-sm font-bold',
          cover ? 'text-brand-foreground' : 'text-muted-foreground',
        )}
      >
        {WELCOME_COPY.skip}
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1 gap-4">
      {cover ? (
        <>
          <View className="-mx-5 -mt-6 h-[230px] bg-brand px-6 pt-14">
            {dots}
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-xs font-bold text-brand-foreground">
                {welcomePosition(i, n)}
              </Text>
              {skip}
            </View>
          </View>
          <View className="-mt-14 h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[24px] border-4 border-background bg-brand">
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                className="h-full w-full"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text className="font-display text-xl text-brand-foreground">
                {initialsOf(groupName)}
              </Text>
            )}
          </View>
        </>
      ) : (
        <View className="gap-3 pt-8">
          {dots}
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground">{welcomePosition(i, n)}</Text>
            {skip}
          </View>
          <View className="mt-2 h-14 w-14 items-center justify-center rounded-[18px] bg-brand/15">
            <Icon name={PLAIN_ICON[welcomePageIcon(page)]} size={24} color={colors.brand} />
          </View>
        </View>
      )}

      <View className="gap-1.5">
        <Text className="text-eb uppercase text-brand">{groupName}</Text>
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          {page.title}
        </Text>
      </View>

      {lines.length > 0 ? (
        <View className="gap-3">
          {lines.map((l, k) => (
            <View key={k} className="flex-row items-start gap-3">
              {l.bullet ? <View className="mt-2 h-2 w-2 rounded-[3px] bg-brand" /> : null}
              <Text className="flex-1 text-base leading-6 text-foreground">{l.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {page.showTeam && team.length > 0 ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-row">
            {team.slice(0, 3).map((m, k) => (
              <Avatar
                key={m.name + k}
                initials={initialsOf(m.name)}
                tone={AVATAR_TONES[k % 3]}
                first={k === 0}
              />
            ))}
          </View>
          <Text className="text-b2 text-muted-foreground">
            {namesLine(team.map((m) => m.name))}
          </Text>
        </View>
      ) : null}

      <View className="flex-1" />

      <View className="flex-row gap-2">
        {canBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => (i > 0 ? setI(i - 1) : onBackFirst?.())}
            className="h-[52px] w-14 items-center justify-center rounded-[16px] bg-surface-2"
          >
            <Icon name="chevL" size={20} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <PrimaryButton brand onPress={() => (i < n - 1 ? setI(i + 1) : onFinish())}>
            {welcomeCta(i, n)}
          </PrimaryButton>
        </View>
      </View>
      {note ? (
        <Text className="text-center text-xs text-muted-foreground">
          {WELCOME_COPY.reviewLater}
        </Text>
      ) : null}
    </View>
  );
}
