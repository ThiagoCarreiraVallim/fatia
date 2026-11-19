'use client';

import { useQuery } from '@tanstack/react-query';
import { orgApi } from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';

/**
 * A lista de membros do painel, com quem saiu (aba "Saíram", #401). Uma só
 * consulta para Membros, o painel da pessoa e o "Acompanhado por" do convite.
 */
export function usePanelMembers(groupId: string) {
  return useQuery({
    queryKey: orgKeys.membersWithLeft(groupId),
    queryFn: () => orgApi.members(groupId, { includeLeft: true }),
  });
}
