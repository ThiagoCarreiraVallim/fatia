import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Crown } from 'lucide-react-native';
import {
  grantableRolesFor,
  groupCan,
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
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  cn,
  useActionSheet,
  useConfirm,
  type ActionSheetOption,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

const FILTROS: { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'team', label: 'Equipe' },
];

function Membros({ g, inicial }: { g: MyGroup; inicial?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const actionSheet = useActionSheet();
  // Cada ação segue o papel (#404): assento é do dono; aprovar, também da
  // recepção; papel e remover, do dono e do admin.
  const fatura = groupCan(g, 'billing.manage');
  const aprova = groupCan(g, 'member.approve');
  const recusa = groupCan(g, 'member.remove');
  const lePessoa = groupCan(g, 'member.file');
  const gerencia = (m: PanelMember) =>
    recusa && m.role !== 'OWNER' && !(g.role === 'ADMIN' && m.role === 'ADMIN');
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
    enabled: fatura,
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

  const manageMember = (m: PanelMember) => {
    const options: ActionSheetOption[] = grantableRolesFor(g.role)
      .filter((r) => r !== m.role)
      .map((r) => ({
        label: `Tornar ${teamRoleLabel(r).toLowerCase()}`,
        onPress: () => papel.mutate({ m, role: r }),
      }));
    if (!fatura) {
      // Sem assento: o admin não mexe em fatura.
    } else if (m.hasAiSeat) {
      options.push({
        label: 'Tirar assento PRO',
        onPress: () => assento.mutate({ m, dar: false }),
      });
    } else if (vaga) {
      options.push({ label: 'Dar assento PRO', onPress: () => assento.mutate({ m, dar: true }) });
    }
    options.push({
      label: 'Remover da comunidade',
      destructive: true,
      onPress: () =>
        confirm({
          title: `Remover ${m.name}?`,
          description: `A equipe perde o acesso ao que essa pessoa compartilhava${m.hasAiSeat ? ', e o assento PRO volta para a comunidade' : ''}. Os registros dela continuam com ela.`,
          confirmLabel: 'Remover',
          cancelLabel: 'Voltar',
          destructive: true,
          onConfirm: () => remover.mutate(m),
        }),
    });
    actionSheet({ title: m.name, description: teamRoleLabel(m.role), options });
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
            const leitura = lePessoa && !pendente && escopos.length > 0;
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
                      {m.hasAiSeat ? <Crown size={14} color={colors.primaryText} /> : null}
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {pendente ? 'Aguardando aprovação' : teamRoleLabel(m.role)}
                    </Text>
                    {!pendente && m.role !== 'OWNER' && lePessoa ? (
                      <Text className="text-xs text-muted-foreground">
                        {escopos.length
                          ? `Compartilha: ${escopos.map((s) => SHARE_SCOPE_LABEL[s]).join(', ')}`
                          : 'Não compartilha nada com você'}
                      </Text>
                    ) : null}
                  </View>
                  {leitura ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
                </Pressable>
                {pendente && aprova ? (
                  <View className="flex-row gap-2">
                    <Button size="sm" onPress={() => aprovar.mutate(m)}>
                      Aprovar
                    </Button>
                    {recusa ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          confirm({
                            title: `Recusar o pedido de ${m.name}?`,
                            description:
                              'A pessoa pode pedir de novo depois, pelo código ou por um convite.',
                            confirmLabel: 'Recusar',
                            cancelLabel: 'Voltar',
                            destructive: true,
                            onConfirm: () => remover.mutate(m),
                          })
                        }
                      >
                        Recusar
                      </Button>
                    ) : null}
                  </View>
                ) : null}
                {!pendente && gerencia(m) ? (
                  <Button size="sm" variant="outline" onPress={() => manageMember(m)}>
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
