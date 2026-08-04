'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Lock } from 'lucide-react';
import {
  professionalApi,
  SHARE_SCOPE_LABEL,
  type ShareScope,
  type StudentReading,
} from '@fatia/api-client';

const ORDEM: ShareScope[] = ['WORKOUT', 'NUTRITION', 'BODY', 'HABITS', 'GOALS'];

function Corpo({ reading }: { reading: StudentReading }) {
  switch (reading.scope) {
    case 'WORKOUT':
      return (
        <div className="space-y-3">
          <Bloco titulo="Planos" vazio="Nenhum plano montado.">
            {reading.plans.map((plano) => (
              <Linha
                key={plano.id}
                titulo={plano.name}
                detalhe={`${plano.exercises.length} exercícios`}
              />
            ))}
          </Bloco>
          <Bloco titulo="Últimas sessões" vazio="Nenhum treino registrado no período.">
            {reading.sessions.map((sessao) => (
              <Linha
                key={sessao.id}
                titulo={new Date(sessao.startedAt).toLocaleDateString('pt-BR')}
                detalhe={sessao.finishedAt ? 'concluído' : 'em andamento'}
              />
            ))}
          </Bloco>
        </div>
      );
    case 'NUTRITION':
      return (
        <Bloco titulo="Dias registrados" vazio="Nenhum dia com refeição registrada.">
          {reading.history.days.map((dia) => (
            <Linha key={dia.date} titulo={dia.date} detalhe={`${Math.round(dia.kcal)} kcal`} />
          ))}
        </Bloco>
      );
    case 'BODY':
      return (
        <Bloco titulo="Peso" vazio="Nenhuma pesagem no período.">
          {reading.weight.points.map((ponto) => (
            <Linha key={ponto.date} titulo={ponto.date} detalhe={`${ponto.weightKg} kg`} />
          ))}
        </Bloco>
      );
    case 'HABITS':
      return (
        <div className="space-y-3">
          <Bloco titulo="Passos" vazio="Sem registro de passos.">
            {reading.steps.points.map((ponto) => (
              <Linha key={ponto.date} titulo={ponto.date} detalhe={String(ponto.value)} />
            ))}
          </Bloco>
          <Bloco titulo="Água" vazio="Sem registro de água.">
            {reading.water.points.map((ponto) => (
              <Linha key={ponto.date} titulo={ponto.date} detalhe={`${ponto.value} ml`} />
            ))}
          </Bloco>
        </div>
      );
    case 'GOALS':
      return (
        <Bloco titulo="Metas" vazio="Nenhuma meta cadastrada.">
          {reading.goals.map((meta) => (
            <Linha key={meta.id} titulo={meta.title} detalhe={`${meta.targetValue} ${meta.unit}`} />
          ))}
        </Bloco>
      );
  }
}

function Bloco({
  titulo,
  vazio,
  children,
}: {
  titulo: string;
  vazio: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="rounded-2xl border border-white/5 bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">{titulo}</h2>
      {children.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{children}</ul>
      )}
    </section>
  );
}

function Linha({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
      <span className="truncate text-sm text-foreground">{titulo}</span>
      <span className="ml-3 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
        {detalhe}
      </span>
    </li>
  );
}

export default function StudentPage() {
  const params = useParams<{ membershipId: string }>();
  const membershipId = params.membershipId;
  const [scope, setScope] = useState<ShareScope | null>(null);

  const alunos = useQuery({
    queryKey: ['professional', 'students'],
    queryFn: () => professionalApi.listStudents(),
  });

  const aluno = useMemo(
    () => alunos.data?.find((a) => a.membershipId === membershipId),
    [alunos.data, membershipId],
  );
  const autorizados = aluno?.scopesGrantedToMe ?? [];
  const ativo = scope ?? autorizados[0] ?? null;

  const leitura = useQuery({
    // A categoria entra na chave: cada uma é uma leitura própria na API e uma
    // linha própria na trilha do aluno. Um cache compartilhado entre categorias
    // faria a tela mostrar treino no lugar de nutrição depois de uma revogação.
    queryKey: ['professional', 'student', membershipId, ativo],
    queryFn: () => professionalApi.readStudent(membershipId, ativo as ShareScope),
    // Sem categoria autorizada não há o que pedir. Disparar assim mesmo só
    // geraria uma tentativa negada na trilha do aluno — barulho que ele leria
    // como sondagem, e ele estaria certo.
    enabled: ativo !== null,
  });

  return (
    <div className="space-y-4 px-5 pt-4">
      <Link
        href="/students"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={14} />
        Alunos
      </Link>

      <header>
        <h1 className="text-2xl font-extrabold text-foreground">{aluno?.name ?? '—'}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Somente leitura. Para entregar um plano, monte-o na sua conta e ofereça: ele só passa a
          existir na conta do aluno quando ele aceitar, e a partir daí é dele.
        </p>
      </header>

      {autorizados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-6 text-center">
          <Lock size={20} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-bold text-foreground">Nada autorizado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Este aluno ainda não liberou nenhuma categoria para você.
          </p>
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Categorias autorizadas">
            {ORDEM.filter((s) => autorizados.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={s === ativo}
                className={
                  s === ativo
                    ? 'rounded-xl bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-foreground'
                    : 'rounded-xl bg-muted px-3 py-2 text-[11px] font-extrabold text-muted-foreground'
                }
              >
                {SHARE_SCOPE_LABEL[s]}
              </button>
            ))}
          </nav>

          {leitura.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-card" />}

          {leitura.isError && (
            <p className="rounded-2xl border border-white/5 bg-card p-4 text-xs text-muted-foreground">
              Não foi possível ler esta categoria. Se o aluno revogou a autorização, ela some da
              lista assim que a página recarregar.
            </p>
          )}

          {leitura.data && (
            <>
              <Corpo reading={leitura.data.reading} />
              <p className="text-[11px] text-muted-foreground">
                Datas no fuso do aluno ({leitura.data.timezone}).
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
