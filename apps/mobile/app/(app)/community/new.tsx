import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GROUP_TYPES,
  groupTypeLabel,
  joinPolicyLabel,
  orgApi,
  panelHref,
  type GroupType,
  type JoinPolicy,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { apiMessage, Choice } from '@/components/org/org-panel';
import { Button, Input } from '@/components/ui';

const POLITICAS: JoinPolicy[] = ['APPROVAL', 'OPEN', 'INVITE_ONLY'];

/** Equivalente de `apps/web/src/app/(app)/community/new/page.tsx`. */
export default function NewCommunityScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<GroupType>('SPONSORED');
  const [politica, setPolitica] = useState<JoinPolicy>('APPROVAL');
  const [descricao, setDescricao] = useState('');

  const criar = useMutation({
    mutationFn: () =>
      orgApi.create({
        name: nome.trim(),
        type: tipo,
        joinPolicy: politica,
        ...(descricao.trim() ? { description: descricao.trim() } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(panelHref(g.id, 'invites'));
    },
  });

  return (
    <Screen>
      <View className="gap-5 px-5 pb-4 pt-4">
        <Input
          value={nome}
          onChangeText={setNome}
          maxLength={120}
          placeholder="Nome"
          accessibilityLabel="Nome"
        />
        <Choice
          label="Tipo"
          options={GROUP_TYPES.map((t) => ({ value: t, label: groupTypeLabel(t) }))}
          value={tipo}
          onChange={setTipo}
        />
        <Choice
          label="Como se entra"
          options={POLITICAS.map((p) => ({ value: p, label: joinPolicyLabel(p) }))}
          value={politica}
          onChange={setPolitica}
        />
        <Text className="text-xs text-muted-foreground">
          Com aprovação, quem usa o código espera você aceitar. Convites entram direto.
        </Text>
        <Input
          value={descricao}
          onChangeText={setDescricao}
          maxLength={500}
          multiline
          className="min-h-[80px]"
          textAlignVertical="top"
          placeholder="Descrição (opcional)"
          accessibilityLabel="Descrição (opcional)"
        />
        {criar.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {apiMessage(criar.error, 'Não deu para criar agora. Tente de novo.')}
          </Text>
        ) : null}
        <Button
          size="lg"
          disabled={nome.trim().length < 2}
          loading={criar.isPending}
          onPress={() => criar.mutate()}
        >
          Criar comunidade
        </Button>
      </View>
    </Screen>
  );
}
