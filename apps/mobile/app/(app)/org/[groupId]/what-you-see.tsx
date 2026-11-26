import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  initialsOf,
  orgApi,
  panelHref,
  sharedCategories,
  usersApi,
  whatYouSeeNotes,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { orgKeys } from '@/components/org/org-panel';
import { Button, Icon, LoadingState, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * "O que você vê" (#372, prancha Onb-E2) — equivalente de
 * `apps/web/src/app/(org)/org/[groupId]/review/what-you-see/page.tsx`: aluno
 * por aluno, o que cada um liberou para quem olha (`scopesGrantedToMe`). No
 * app o "Para revisar" chega com a #414; "Entendi" volta ao painel.
 */
export default function WhatYouSeeScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(0);
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const members = useQuery({
    queryKey: orgKeys.members(groupId),
    queryFn: () => orgApi.members(groupId),
  });
  const alunos = (members.data ?? []).filter((m) => m.role === 'MEMBER' && m.status === 'ACTIVE');

  return (
    <Screen
      footer={
        <Button size="xl" onPress={() => router.replace(panelHref(groupId) as never)}>
          Entendi
        </Button>
      }
    >
      <View className="gap-5 px-5 pb-4 pt-2">
        <Text accessibilityRole="header" className="font-display text-[32px] text-foreground">
          Você vê só o que cada aluno liberou
        </Text>
        {members.isPending ? (
          <LoadingState label="Carregando…" />
        ) : alunos.length === 0 ? (
          <Text className="rounded-card bg-card p-5 text-sm text-muted-foreground">
            Quando um aluno entrar, ele escolhe o que compartilhar com a equipe. Você vê aqui só o
            que ele liberou.
          </Text>
        ) : (
          <View className="gap-1 rounded-card bg-card p-3">
            {alunos.map((a, i) => {
              const aberto = open === i;
              return (
                <View key={a.membershipId}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: aberto }}
                    onPress={() => setOpen(aberto ? -1 : i)}
                    className="min-h-[52px] flex-row items-center gap-3 rounded-xl p-2 active:opacity-80"
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
                      <Text className="text-xs font-bold text-foreground">
                        {initialsOf(a.name)}
                      </Text>
                    </View>
                    <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
                      {a.name}
                    </Text>
                    <View style={{ transform: [{ rotate: aberto ? '180deg' : '0deg' }] }}>
                      <Icon name="chevD" size={18} color={colors.mutedForeground} />
                    </View>
                  </Pressable>
                  {aberto ? (
                    <View
                      accessibilityLabel={`O que ${a.name} liberou`}
                      className="flex-row flex-wrap gap-2 px-2 pb-3 pt-1"
                    >
                      {sharedCategories(a.scopesGrantedToMe ?? []).map((c) => (
                        <View
                          key={c.label}
                          className={cn(
                            'rounded-full px-3 py-1',
                            c.shared ? 'bg-primary-soft' : 'bg-muted',
                          )}
                        >
                          <Text
                            className={cn(
                              'text-xs font-bold uppercase',
                              c.shared ? 'text-primary-text' : 'text-muted-foreground',
                            )}
                          >
                            {c.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        <View className="gap-4">
          {whatYouSeeNotes(me.data?.name ?? null).map((n) => (
            <View key={n.title} className="flex-row gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-card">
                <Icon name={n.icon} size={18} color={colors.foreground} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-foreground">{n.title}</Text>
                <Text className="text-[13px] text-muted-foreground">{n.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
