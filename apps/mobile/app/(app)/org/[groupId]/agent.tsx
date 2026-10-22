import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react-native';
import {
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
  agentProblem,
  groupAgentApi,
  suggestedAgentName,
  type GroupAgent,
  type MyGroup,
} from '@fatia/api-client';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';

function Formulario({ g, atual }: { g: MyGroup; atual: GroupAgent }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nome, setNome] = useState(atual.configured ? atual.name : suggestedAgentName(g.name));
  const [orientacoes, setOrientacoes] = useState(atual.instructions);
  const [ligado, setLigado] = useState(atual.configured ? atual.enabled : true);
  const [avatar, setAvatar] = useState<ImageValue | null>(
    atual.avatar ? { fileId: atual.avatar.id, url: atual.avatar.url } : null,
  );

  const problema = agentProblem({ name: nome, instructions: orientacoes });
  const avatarMudou = (avatar?.fileId ?? null) !== (atual.avatar?.id ?? null);
  const mudou =
    !atual.configured ||
    nome.trim() !== atual.name ||
    orientacoes.trim() !== atual.instructions ||
    ligado !== atual.enabled ||
    avatarMudou;

  const salvar = useMutation({
    mutationFn: () =>
      groupAgentApi.put(g.id, {
        name: nome.trim(),
        instructions: orientacoes.trim(),
        enabled: ligado,
        ...(avatarMudou ? { avatarFileId: avatar?.fileId ?? null } : {}),
      }),
    onSuccess: (salvo) => {
      qc.setQueryData(orgKeys.agent(g.id), salvo);
      toast.show({
        message: salvo.enabled
          ? 'Agente salvo e ligado no chat.'
          : 'Agente salvo. Ele está desligado.',
      });
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para salvar o agente agora.') }),
  });

  const avatarDaPrevia = avatar?.url ?? g.avatarUrl;

  return (
    <>
      <PanelCard title="Agente do chat">
        <Text className="text-xs text-muted-foreground">
          {`É o assistente que os membros encontram no chat da Fatia, com o nome e o jeito da ${g.name}. O chat é na web.`}
        </Text>
        <Choice
          label="No chat"
          options={[
            { value: 'on', label: 'Ligado' },
            { value: 'off', label: 'Desligado' },
          ]}
          value={ligado ? 'on' : 'off'}
          onChange={(v) => setLigado(v === 'on')}
        />
        <Input
          value={nome}
          onChangeText={setNome}
          maxLength={AGENT_NAME_MAX}
          accessibilityLabel="Nome"
          placeholder="Nome"
        />
        <ImageField
          groupId={g.id}
          purpose="agent_avatar"
          label={
            g.avatarUrl ? 'Avatar do agente. Sem um, ele usa o da comunidade.' : 'Avatar do agente.'
          }
          square
          value={avatar}
          onChange={setAvatar}
        />
        <Input
          value={orientacoes}
          onChangeText={setOrientacoes}
          maxLength={AGENT_INSTRUCTIONS_MAX}
          multiline
          className="min-h-[140px]"
          textAlignVertical="top"
          accessibilityLabel="Orientações"
          placeholder="Tom, foco e o que recomendar. Ex.: sugira os planos prontos da casa."
        />
        <Text className="self-end text-xs text-muted-foreground">
          {`${orientacoes.length}/${AGENT_INSTRUCTIONS_MAX}`}
        </Text>
        {problema ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {problema}
          </Text>
        ) : null}
        <Button
          disabled={!mudou || Boolean(problema)}
          loading={salvar.isPending}
          onPress={() => salvar.mutate()}
        >
          Salvar
        </Button>
      </PanelCard>

      <PanelCard title="Como aparece no chat">
        <View className="flex-row items-center gap-3">
          {avatarDaPrevia ? (
            <Image
              source={{ uri: avatarDaPrevia }}
              accessibilityIgnoresInvertColors
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bot size={22} color={cores.primary} />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {nome.trim() || 'Sem nome'}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {`Agente da ${g.name}`}
            </Text>
          </View>
        </View>
        <Text className="text-xs text-muted-foreground">
          {ligado
            ? 'Quem tem assento pago pela comunidade começa as conversas novas com ele. Os outros membros escolhem no chat.'
            : 'Desligado: não aparece para ninguém.'}
        </Text>
      </PanelCard>

      <PanelCard title="O que as orientações não mudam">
        <Text className="text-xs text-muted-foreground">
          {
            '• O agente só vê os dados de quem está conversando, nunca os de outro membro.\n• Nada é gravado sem a pessoa aprovar na tela.\n• Ele não dá diagnóstico, remédio nem dose, e não se passa por profissional.'
          }
        </Text>
      </PanelCard>
    </>
  );
}

function Agente({ g }: { g: MyGroup }) {
  const agente = useQuery({
    queryKey: orgKeys.agent(g.id),
    queryFn: () => groupAgentApi.get(g.id),
    enabled: g.role === 'OWNER',
  });
  if (g.role !== 'OWNER') {
    return (
      <EmptyState
        title="Só o dono configura o agente"
        description="Peça a quem é dono da comunidade para mudar o agente do chat."
      />
    );
  }
  if (agente.isError) {
    return <ErrorState error={agente.error} onRetry={() => void agente.refetch()} />;
  }
  if (!agente.data) return <LoadingState />;
  return <Formulario g={g} atual={agente.data} />;
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/agent/page.tsx`. */
export default function OrgAgentScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Agente g={g} />}</OrgPanel>;
}
