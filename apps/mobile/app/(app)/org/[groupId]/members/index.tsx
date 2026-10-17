import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Crown } from 'lucide-react-native';
import {
  filterMembers,
  hasFreeSeat,
  orgApi,
  panelHref,
  seatsApi,
  SHARE_SCOPE_LABEL,
  teamRoleLabel,
  type GrantableRole,
  type MemberFilter,
  type MyGroup,
  type PanelMember,
} from '@fatia/api-client';
import { apiMessage, Choice, OrgPanel, orgKeys } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';

const FILTROS: { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'team', label: 'Equipe' },
];
const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

function Membros({ g, inicial }: { g: MyGroup; inicial?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const dono = g.role === 'OWNER';
  const [filtro, setFiltro] = useState<MemberFilter>(
    inicial === 'pending' || inicial === 'team' ? inicial : 'all',
  );
  const [busca, setBusca] = useState('');

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const falhou = (padrao: string) => (err: unknown) =>
    toast.show({ message: apiMessage(err, padrao) });

  const aprovar = useMutation({
    mutationFn: (m: PanelMember) => orgApi.approve(g.id, m.membershipId, 'MEMBER'),
    onSuccess: (_r, m) => {
      toast.show({ message: `${m.name} entrou na comunidade.` });
      refrescar();
    },
    onError: falhou('Não deu para aprovar agora.'),
  });
  const papel = useMutation({
    mutationFn: ({ m, role }: { m: PanelMember; role: GrantableRole }) =>
      orgApi.setRole(g.id, m.membershipId, role),
    onSuccess: (_r, { m, role }) => {
      toast.show({ message: `${m.name} agora é ${teamRoleLabel(role).toLowerCase()}.` });
      refrescar();
    },
    onError: falhou('Não deu para mudar o papel agora.'),
  });
  const remover = useMutation({
    mutationFn: (m: PanelMember) => orgApi.removeMember(g.id, m.membershipId),
    onSuccess: (_r, m) => {
      toast.show({
        message: m.status === 'INVITED' ? 'Pedido recusado.' : `${m.name} saiu da comunidade.`,
      });
      refrescar();
    },
    onError: falhou('Não deu para remover agora.'),
  });
  const assento = useMutation({
    mutationFn: ({ m, dar }: { m: PanelMember; dar: boolean }) =>
      dar ? seatsApi.assign(g.id, m.membershipId) : seatsApi.unassign(g.id, m.membershipId),
    onSuccess: (_r, { m, dar }) => {
      toast.show({
        message: dar ? `${m.name} ganhou um assento PRO.` : `O assento de ${m.name} foi liberado.`,
      });
      refrescar();
    },
    onError: falhou('Não deu para mudar o assento agora.'),
  });

  const vaga = assentos.data ? hasFreeSeat(assentos.data) : false;

  const gerenciar = (m: PanelMember) => {
    const botoes: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] =
      PAPEIS.filter((r) => r !== m.role).map((r) => ({
        text: `Tornar ${teamRoleLabel(r).toLowerCase()}`,
        onPress: () => papel.mutate({ m, role: r }),
      }));
    if (m.hasAiSeat) {
      botoes.push({ text: 'Tirar assento PRO', onPress: () => assento.mutate({ m, dar: false }) });
    } else if (vaga) {
      botoes.push({ text: 'Dar assento PRO', onPress: () => assento.mutate({ m, dar: true }) });
    }
    botoes.push({
      text: 'Remover da comunidade',
      style: 'destructive',
      onPress: () =>
        Alert.alert(
          `Remover ${m.name}?`,
          `A equipe perde o acesso ao que essa pessoa compartilhava${m.hasAiSeat ? ', e o assento PRO volta para a comunidade' : ''}. Os registros dela continuam com ela.`,
          [
            { text: 'Voltar', style: 'cancel' },
            { text: 'Remover', style: 'destructive', onPress: () => remover.mutate(m) },
          ],
        ),
    });
    botoes.push({ text: 'Fechar', style: 'cancel' });
    Alert.alert(m.name, teamRoleLabel(m.role), botoes);
  };

  const lista = filterMembers(membros.data ?? [], filtro, busca);

  return (
    <>
      <Choice label="" options={FILTROS} value={filtro} onChange={setFiltro} />
      <Input
        value={busca}
        onChangeText={setBusca}
        placeholder="Buscar por nome"
        accessibilityLabel="Buscar por nome"
      />
      {membros.isPending ? <LoadingState label="Carregando membros…" /> : null}
      {membros.data && lista.length === 0 ? (
        <EmptyState
          title={filtro === 'pending' ? 'Nenhum pedido aguardando' : 'Ninguém por aqui'}
        />
      ) : null}
      {lista.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {lista.map((m, i) => {
            const pendente = m.status === 'INVITED';
            const escopos = m.scopesGrantedToMe ?? [];
            const leitura = !pendente && escopos.length > 0;
            return (
              <View
                key={m.membershipId}
                className={cn('gap-2 px-4 py-3', i < lista.length - 1 && 'border-b border-border')}
              >
                <Pressable
                  accessibilityRole={leitura ? 'link' : undefined}
                  accessibilityLabel={`${m.name}, ${pendente ? 'aguardando aprovação' : teamRoleLabel(m.role)}${m.hasAiSeat ? ', com assento PRO' : ''}`}
                  accessibilityHint={
                    leitura ? 'Abre o que a pessoa compartilha com você' : undefined
                  }
                  disabled={!leitura}
                  onPress={() => router.push(`${panelHref(g.id, 'members')}/${m.membershipId}`)}
                  className="min-h-[44px] flex-row items-center gap-2 active:opacity-80"
                >
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-foreground">{m.name}</Text>
                      {m.hasAiSeat ? <Crown size={14} color={cores.primary} /> : null}
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {pendente ? 'Aguardando aprovação' : teamRoleLabel(m.role)}
                    </Text>
                    {!pendente && m.role !== 'OWNER' ? (
                      <Text className="text-xs text-muted-foreground">
                        {escopos.length
                          ? `Compartilha: ${escopos.map((s) => SHARE_SCOPE_LABEL[s]).join(', ')}`
                          : 'Não compartilha nada com você'}
                      </Text>
                    ) : null}
                  </View>
                  {leitura ? <ChevronRight size={18} color={cores.mutedForeground} /> : null}
                </Pressable>
                {pendente && dono ? (
                  <View className="flex-row gap-2">
                    <Button size="sm" onPress={() => aprovar.mutate(m)}>
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() =>
                        Alert.alert(
                          `Recusar o pedido de ${m.name}?`,
                          'A pessoa pode pedir de novo depois, pelo código ou por um convite.',
                          [
                            { text: 'Voltar', style: 'cancel' },
                            {
                              text: 'Recusar',
                              style: 'destructive',
                              onPress: () => remover.mutate(m),
                            },
                          ],
                        )
                      }
                    >
                      Recusar
                    </Button>
                  </View>
                ) : null}
                {!pendente && dono && m.role !== 'OWNER' ? (
                  <Button size="sm" variant="outline" onPress={() => gerenciar(m)}>
                    Gerenciar
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/members/page.tsx`. */
export default function OrgMembersScreen() {
  const { groupId, filtro } = useLocalSearchParams<{ groupId: string; filtro?: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Membros g={g} inicial={filtro} />}</OrgPanel>;
}
