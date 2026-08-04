'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { professionalApi } from '@fatia/api-client';

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

  return (
    <Link
      href="/students"
      className="flex items-center gap-4 border-b border-white/5 px-4 py-4 last:border-b-0"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60">
        <Users size={18} className="text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold leading-tight text-foreground">Meus alunos</p>
        <p className="text-xs text-muted-foreground">
          {total === 1 ? '1 aluno atendido' : `${total} alunos atendidos`} — somente leitura
        </p>
      </div>
      <ChevronRight size={18} className="text-muted-foreground" />
    </Link>
  );
}
