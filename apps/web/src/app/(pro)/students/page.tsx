'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { professionalApi } from '@fatia/api-client';
import { ScopeChips } from '@/components/sharing/scope-chips';

export default function StudentsPage() {
  const alunos = useQuery({
    queryKey: ['professional', 'students'],
    queryFn: () => professionalApi.listStudents(),
  });

  const lista = alunos.data ?? [];

  return (
    <div className="space-y-4 px-5 pt-4">
      <header>
        <h1 className="text-2xl font-extrabold text-foreground">Alunos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você vê de cada aluno apenas o que ele autorizou, e cada consulta fica registrada na
          trilha dele.
        </p>
      </header>

      {alunos.isLoading && (
        <div className="space-y-3">
          <div className="h-[104px] animate-pulse rounded-2xl bg-card" />
          <div className="h-[104px] animate-pulse rounded-2xl bg-card" />
        </div>
      )}

      {!alunos.isLoading && lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-6 text-center">
          <Users size={20} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-bold text-foreground">Nenhum aluno por aqui</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Alunos aparecem depois que a academia aprova a entrada deles e define você como
            profissional do grupo.
          </p>
        </div>
      )}

      {lista.map((aluno) => (
        <Link
          key={aluno.membershipId}
          href={`/students/${aluno.membershipId}`}
          className="flex items-start gap-3 rounded-2xl border border-white/5 bg-card p-4 hover:border-white/10"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-foreground">{aluno.name}</p>
            <p className="truncate text-xs text-muted-foreground">{aluno.groupName}</p>
            <ScopeChips granted={aluno.scopesGrantedToMe} />
            {aluno.scopesGrantedToMe.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ainda não autorizou nada. Peça a ele que libere as categorias em Privacidade.
              </p>
            )}
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
