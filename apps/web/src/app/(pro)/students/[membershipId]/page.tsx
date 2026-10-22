'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { professionalApi } from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { MemberReading } from '@/components/sharing/member-reading';

export default function StudentPage() {
  const params = useParams<{ membershipId: string }>();
  const membershipId = params.membershipId;

  const alunos = useQuery({
    queryKey: ['professional', 'students'],
    queryFn: () => professionalApi.listStudents(),
  });

  const aluno = useMemo(
    () => alunos.data?.find((a) => a.membershipId === membershipId),
    [alunos.data, membershipId],
  );
  useTopBarTitle(aluno?.name);

  return (
    <div className="space-y-4 px-5 pt-4">
      <p className="text-xs text-muted-foreground">
        Somente leitura. Para entregar um plano, monte-o na sua conta e ofereça: ele só passa a
        existir na conta do aluno quando ele aceitar, e a partir daí é dele.
      </p>
      {/* `key`: trocar de pessoa recomeça na primeira categoria dela. */}
      <MemberReading
        key={membershipId}
        membershipId={membershipId}
        granted={aluno?.scopesGrantedToMe ?? []}
      />
    </div>
  );
}
