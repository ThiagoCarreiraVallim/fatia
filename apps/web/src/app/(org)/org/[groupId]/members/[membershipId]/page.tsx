'use client';

import { useParams } from 'next/navigation';
import { useOrgGroup } from '@/components/org/org-shell';
import { MemberFile } from '@/components/org/member-file/member-file';

/**
 * A ficha da pessoa (#402, Pn-05): resumo, planos, as categorias que ela
 * compartilha com quem olha e a agenda planejada. Cada categoria aberta entra
 * em "Quem acessou seus dados", no app dela.
 */
export default function OrgMemberPage() {
  const g = useOrgGroup();
  const { membershipId } = useParams<{ membershipId: string }>();
  return <MemberFile key={membershipId} groupId={g.id} membershipId={membershipId} />;
}
