import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  communityNameProblem,
  needsCommunityName,
  PROFILE_NAME_MAX,
  usersApi,
  type MeUser,
} from '@fatia/api-client';
import { Input } from '@/components/ui';
import { Text } from '@/components/ui/text';

/**
 * Antes do primeiro post ou da entrada num desafio, quem ainda está com o nome
 * provisório (o `sub` ou o pedaço do e-mail, ADR 050) escolhe como aparece. O
 * nome vai para o perfil: depois disso a pergunta não volta.
 */
export function useCommunityNameGate() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const [name, setName] = useState('');
  const needed = needsCommunityName(me.data);
  const problem = needed && me.data ? communityNameProblem(name, me.data) : null;

  /** Grava o nome no perfil, se for preciso; chame antes de publicar ou entrar. */
  const save = async () => {
    if (!needed) return;
    const atualizado = await usersApi.updateMe({ name: name.trim() });
    qc.setQueryData<MeUser>(['users', 'me'], atualizado);
  };

  return { needed, name, setName, problem, save };
}

export type CommunityNameGate = ReturnType<typeof useCommunityNameGate>;

export function CommunityNameField({ gate }: { gate: CommunityNameGate }) {
  if (!gate.needed) return null;
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">Seu nome</Text>
      <Input
        value={gate.name}
        onChangeText={gate.setName}
        maxLength={PROFILE_NAME_MAX}
        autoCapitalize="words"
        autoComplete="name"
        accessibilityLabel="Seu nome"
        placeholder="Como você quer aparecer"
      />
      <Text className="text-xs text-muted-foreground">
        É assim que a comunidade vai te ver. Fica no seu perfil; dá para trocar em Você.
      </Text>
    </View>
  );
}
