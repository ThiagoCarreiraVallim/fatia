'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { orgApi, teamRoleLabel } from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { MemberReading } from '@/components/sharing/member-reading';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Um membro, pelo que ele compartilha com quem olha. A leitura é a mesma da
 * tela "Membros" do profissional: auditada, uma categoria por vez.
 */
export default function OrgMemberPage() {
  const g = useOrgGroup();
  const { membershipId } = useParams<{ membershipId: string }>();
  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const m = membros.data?.find((x) => x.membershipId === membershipId);
  useTopBarTitle(m?.name);

  if (membros.isPending) return <Skeleton className="h-40 rounded-2xl bg-card" />;
  if (!m) {
    return (
      <EmptyState
        title="Membro não encontrado"
        description="A pessoa saiu da comunidade, ou o endereço está errado."
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-muted-foreground">
        {`${teamRoleLabel(m.role)} · somente leitura. Cada categoria aberta aqui aparece para ${m.name} em "Quem acessou seus dados".`}
      </p>
      <MemberReading
        key={membershipId}
        membershipId={membershipId}
        granted={m.scopesGrantedToMe ?? []}
      />
    </div>
  );
}
