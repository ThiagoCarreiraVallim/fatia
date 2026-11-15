'use client';

import { useQuery } from '@tanstack/react-query';
import { professionalApi } from '@fatia/api-client';
import { YouLinkRow } from '@/components/you/you-list';

/**
 * A porta de entrada do painel do profissional (#157).
 *
 * Sem ela o painel existe e ninguém chega: só quem digitasse `/students` na
 * barra de endereços. É o mesmo defeito da #164 — a tela mais importante da
 * issue inalcançável na prática — e por isso a entrada é parte da issue, não de
 * uma próxima.
 *
 * **Só aparece para quem atende alguém**, e a condição é a própria lista: a API
 * devolve `[]` para quem não é `PROFESSIONAL` em grupo nenhum, sem 403. Isso é
 * de propósito nas duas pontas — o papel não é global, é por grupo, e um 403
 * revelaria a existência do painel para quem não tem nada a ver com ele. Aqui a
 * consequência é direta: lista vazia, item nenhum, e o perfil de quem só usa o
 * app para si não ganha uma linha que não significa nada para ele.
 *
 * Enquanto a consulta corre não se renderiza esqueleto: um item que aparece e
 * some no perfil de todo mundo seria pior que a espera.
 */
export function ProfessionalPanelLink() {
  const alunos = useQuery({
    queryKey: ['professional', 'students'],
    queryFn: () => professionalApi.listStudents(),
    // Falha aqui não é erro do usuário: sem lista, sem item, e o resto do perfil
    // segue igual.
    retry: false,
  });

  const total = alunos.data?.length ?? 0;
  if (total === 0) return null;

  // Uma linha de Você › Comunidade e equipe (prancha Al-V1): mesmo desenho das outras.
  return (
    <YouLinkRow
      href="/students"
      icon="users"
      label="Membros"
      subtitle={`${total === 1 ? '1 pessoa compartilha com você' : `${total} pessoas compartilham com você`} — somente leitura`}
    />
  );
}
