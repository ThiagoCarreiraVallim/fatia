'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  contentApi,
  memberFileApi,
  type MemberFile,
  type SendMemberPlanInput,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fileKeys } from './keys';

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * "Adicionar plano para a Ana" (Pn-05q): um treino da biblioteca desta
 * comunidade, com quando começa e um recado. A pessoa recebe uma cópia e
 * aceita no app; a equipe edita a cópia depois, sem mudar a biblioteca.
 *
 * Alimentação e "Criar para a Ana" chegam com os editores (#406, #407).
 */
export function AddPlanForm({
  file,
  firstName,
  onDone,
}: {
  file: MemberFile;
  firstName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const biblioteca = useQuery({
    queryKey: fileKeys.library(file.groupId),
    queryFn: () => contentApi.plans(file.groupId),
  });
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [quando, setQuando] = useState<'FLEXIBLE' | 'CALENDAR'>('FLEXIBLE');
  const [inicio, setInicio] = useState(file.nextDays[0]?.date ?? '');
  const [semanas, setSemanas] = useState(4);
  const [dias, setDias] = useState<number[]>([1, 3, 5]);
  const [nota, setNota] = useState('');

  const jaCom = new Set(file.plans.workout.map((p) => p.sourceTemplateId).filter(Boolean));
  const treinos = (biblioteca.data ?? [])
    .filter((t) => t.kind === 'WORKOUT')
    .filter((t) => !busca.trim() || fold(t.title).includes(fold(busca.trim())));

  const enviar = useMutation({
    mutationFn: (input: SendMemberPlanInput) =>
      memberFileApi.sendPlan(file.groupId, file.membershipId, input),
    onSuccess: () => {
      toast(`Enviado · aparece para a ${firstName} quando ela aceitar`);
      void qc.invalidateQueries({ queryKey: fileKeys.file(file.groupId, file.membershipId) });
      onDone();
    },
    onError: () => toast('Não deu para enviar o plano.'),
  });

  const podeEnviar =
    escolhido !== null &&
    (quando === 'FLEXIBLE' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(inicio) && semanas >= 1 && dias.length > 0));

  const submit = () => {
    if (!escolhido || !podeEnviar) return;
    const base: SendMemberPlanInput = { templateId: escolhido, schedule: quando };
    if (quando === 'CALENDAR') {
      Object.assign(base, { startDate: inicio, weeks: semanas, weekdays: dias });
    }
    if (nota.trim()) base.note = nota.trim();
    enviar.mutate(base);
  };

  return (
    <form
      aria-label={`Adicionar plano para a ${firstName}`}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!file.canSendPlans && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          {`Para mandar plano, a ${firstName} precisa compartilhar algo com você (ela liga no app, em Comunidade → Sobre).`}
        </p>
      )}

      <label className="relative block">
        <span className="sr-only">Buscar na biblioteca</span>
        <Search
          size={16}
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar na biblioteca"
          className="pl-9"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-muted-foreground">Treino da biblioteca</legend>
        {biblioteca.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {biblioteca.data && treinos.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum treino na biblioteca{busca.trim() ? ` com “${busca.trim()}”` : ''}.
          </p>
        )}
        {treinos.map((t) => (
          <label
            key={t.id}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-muted/40 px-3 py-2',
              escolhido === t.id && 'bg-primary/10 ring-1 ring-primary',
            )}
          >
            <input
              type="radio"
              name="modelo"
              value={t.id}
              checked={escolhido === t.id}
              onChange={() => setEscolhido(t.id)}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">{t.title}</span>
              <span className="block text-xs text-muted-foreground">
                {[`${t.exercises.length} exercícios`, t.authorName].filter(Boolean).join(' · ')}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {t.publishedAt && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    na comunidade
                  </span>
                )}
                {jaCom.has(t.id) && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {`já com a ${firstName}`}
                  </span>
                )}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground">Começa</p>
        <Segmented
          label="Quando começa"
          value={quando}
          onChange={setQuando}
          options={[
            { value: 'FLEXIBLE', label: 'Sem datas' },
            { value: 'CALENDAR', label: 'Com calendário' },
          ]}
        />
        {quando === 'CALENDAR' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Primeiro dia
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">
              Semanas
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={16}
                value={semanas}
                onChange={(e) => setSemanas(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-xs text-muted-foreground">Dias da semana</legend>
              <div className="mt-1 flex flex-wrap gap-1">
                {WEEKDAYS.map((w, i) => {
                  const d = i + 1;
                  const on = dias.includes(d);
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDias((ds) => (on ? ds.filter((x) => x !== d) : [...ds, d].sort()))
                      }
                      className={cn(
                        'min-h-11 min-w-11 rounded-xl px-2 text-xs font-bold',
                        on
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </div>

      <label className="block text-xs font-bold text-muted-foreground">
        {`Nota para a ${firstName} (opcional)`}
        <Textarea
          rows={2}
          maxLength={1000}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="mt-1"
        />
      </label>

      <p className="text-xs text-muted-foreground">
        {`A ${firstName} recebe uma cópia e aceita no app. Você edita essa cópia depois, sem mudar a biblioteca.`}
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="text" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeEnviar || !file.canSendPlans || enviar.isPending}>
          {`Enviar para a ${firstName}`}
        </Button>
      </div>
    </form>
  );
}
