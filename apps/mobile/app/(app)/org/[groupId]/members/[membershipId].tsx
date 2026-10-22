import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { orgApi, teamRoleLabel, type MyGroup } from '@fatia/api-client';
import { OrgPanel, orgKeys } from '@/components/org/org-panel';
import { MemberReading } from '@/components/sharing/member-reading';
import { EmptyState, LoadingState } from '@/components/ui';

function Membro({ g, membershipId }: { g: MyGroup; membershipId: string }) {
  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  if (membros.isPending) return <LoadingState label="Carregando…" />;
  const m = membros.data?.find((x) => x.membershipId === membershipId);
  if (!m) {
    return (
      <EmptyState
        title="Membro não encontrado"
        description="A pessoa saiu da comunidade, ou o endereço está errado."
      />
    );
  }
  return (
    <>
      <Text className="text-xs text-muted-foreground">
        {`${teamRoleLabel(m.role)} · somente leitura. Cada categoria aberta aqui aparece para ${m.name} em "Quem acessou seus dados".`}
      </Text>
      <MemberReading
        key={membershipId}
        membershipId={membershipId}
        granted={m.scopesGrantedToMe ?? []}
      />
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/members/[membershipId]/page.tsx`. */
export default function OrgMemberScreen() {
  const { groupId, membershipId } = useLocalSearchParams<{
    groupId: string;
    membershipId: string;
  }>();
  const membros = useQuery({
    queryKey: orgKeys.members(groupId),
    queryFn: () => orgApi.members(groupId),
  });
  const nome = membros.data?.find((x) => x.membershipId === membershipId)?.name;
  return (
    <OrgPanel groupId={groupId} title={nome}>
      {(g) => <Membro g={g} membershipId={membershipId} />}
    </OrgPanel>
  );
}
