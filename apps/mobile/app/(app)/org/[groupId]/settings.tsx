import { useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  joinPolicyLabel,
  orgApi,
  panelHref,
  teamRoleLabel,
  type JoinPolicy,
  type MyGroup,
} from '@fatia/api-client';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const POLITICAS: JoinPolicy[] = ['OPEN', 'APPROVAL', 'INVITE_ONLY'];

function Configuracoes({ g }: { g: MyGroup }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [nome, setNome] = useState(g.name);
  const [descricao, setDescricao] = useState(g.description ?? '');
  const [politica, setPolitica] = useState<JoinPolicy>(g.joinPolicy);
  const [novoDono, setNovoDono] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const candidatos = (membros.data ?? []).filter(
    (m) => m.status === 'ACTIVE' && m.role !== 'OWNER',
  );

  const salvar = useMutation({
    mutationFn: () =>
      orgApi.update(g.id, {
        name: nome.trim(),
        description: descricao.trim() || null,
        joinPolicy: politica,
      }),
    onSuccess: () => {
      toast.show({ message: 'Comunidade atualizada.' });
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });
  const transferir = useMutation({
    mutationFn: () => orgApi.transferOwner(g.id, novoDono),
    onSuccess: () => {
      toast.show({
        message: 'A comunidade tem outra pessoa como dona. Você segue como profissional.',
      });
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(panelHref(g.id));
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para transferir agora.') }),
  });
  const apagar = useMutation({
    mutationFn: () => orgApi.remove(g.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace('/community');
    },
    onError: (err) =>
      toast.show({
        message:
          err instanceof ApiError && err.status === 503
            ? 'Não conseguimos cancelar a cobrança dos assentos agora. Nada foi apagado; tente de novo em alguns minutos.'
            : apiMessage(err, 'Não deu para apagar agora.'),
      }),
  });

  const mudou =
    nome.trim() !== g.name ||
    (descricao.trim() || null) !== g.description ||
    politica !== g.joinPolicy;
  const alvo = candidatos.find((m) => m.membershipId === novoDono);

  return (
    <>
      <PanelCard title="Perfil">
        <Input
          value={nome}
          onChangeText={setNome}
          maxLength={80}
          accessibilityLabel="Nome"
          placeholder="Nome"
        />
        <Input
          value={descricao}
          onChangeText={setDescricao}
          maxLength={500}
          multiline
          className="min-h-[80px]"
          textAlignVertical="top"
          accessibilityLabel="Descrição"
          placeholder="Descrição"
        />
        <Choice
          label="Como se entra"
          options={POLITICAS.map((p) => ({ value: p, label: joinPolicyLabel(p) }))}
          value={politica}
          onChange={setPolitica}
        />
        <Button
          disabled={!mudou || nome.trim().length < 2}
          loading={salvar.isPending}
          onPress={() => salvar.mutate()}
        >
          Salvar
        </Button>
      </PanelCard>

      <PanelCard title="Código de entrada">
        <Text selectable className="text-base font-semibold text-foreground">
          {g.slug}
        </Text>
        <Button
          size="sm"
          variant="outline"
          onPress={() =>
            void Share.share({
              message: `Código da ${g.name} no Fatia: ${g.slug} (Comunidade › Entrar com código)`,
            })
          }
        >
          Compartilhar código
        </Button>
      </PanelCard>

      <PanelCard title="Passar adiante ou apagar">
        {candidatos.length > 0 ? (
          <Choice
            label="Transferir para"
            options={candidatos.map((m) => ({
              value: m.membershipId,
              label: `${m.name} (${teamRoleLabel(m.role).toLowerCase()})`,
            }))}
            value={novoDono}
            onChange={setNovoDono}
          />
        ) : (
          <Text className="text-xs text-muted-foreground">Ninguém para quem transferir ainda.</Text>
        )}
        <Button
          variant="outline"
          disabled={!alvo}
          loading={transferir.isPending}
          onPress={() =>
            Alert.alert(
              'Transferir a comunidade?',
              `${alvo?.name ?? 'A pessoa'} passa a ser dona, com a cobrança dos assentos. Você continua na equipe como profissional.`,
              [
                { text: 'Voltar', style: 'cancel' },
                { text: 'Transferir', style: 'destructive', onPress: () => transferir.mutate() },
              ],
            )
          }
        >
          Transferir
        </Button>
        <View className="gap-2 border-t border-border pt-3">
          <Text className="text-xs text-muted-foreground">
            Apagar tira os membros, os convites e o que cada um compartilhava, e cancela os
            assentos. Os registros de cada pessoa continuam com ela. Para confirmar, digite o nome
            da comunidade.
          </Text>
          <Input
            value={confirmacao}
            onChangeText={setConfirmacao}
            autoCapitalize="none"
            accessibilityLabel="Nome da comunidade, para confirmar"
            placeholder={g.name}
          />
          <Button
            variant="destructive"
            disabled={confirmacao.trim() !== g.name}
            loading={apagar.isPending}
            onPress={() => apagar.mutate()}
          >
            Apagar a comunidade
          </Button>
        </View>
      </PanelCard>
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/settings/page.tsx`. */
export default function OrgSettingsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Configuracoes g={g} />}</OrgPanel>;
}
