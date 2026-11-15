'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BRAZIL_UNITS,
  DISTANCE_UNIT_OPTIONS,
  isBrazilDefault,
  LOAD_UNIT_OPTIONS,
  unitPrefsOf,
  unitsPreview,
  usersApi,
  type MeUser,
  type UnitPrefs,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';

/**
 * Unidades (pranchas Al-V10/V10b): carga em kg ou lb, distância em km, m ou
 * milhas. Salva a cada toque, com a prévia ao vivo; o que já foi registrado não
 * muda — o banco continua em kg e metros.
 */
export function UnitsScreen() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const prefs = unitPrefsOf(me.data);

  const save = useMutation({
    mutationFn: (next: UnitPrefs) => usersApi.updateMe(next),
    // Otimista: a prévia muda no toque, e volta se a API recusar.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['users', 'me'] });
      const before = qc.getQueryData<MeUser>(['users', 'me']);
      if (before) qc.setQueryData<MeUser>(['users', 'me'], { ...before, ...next });
      return { before };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.before) qc.setQueryData(['users', 'me'], ctx.before);
      toast('Não deu para salvar. Tente de novo.');
    },
    onSuccess: (data) => qc.setQueryData(['users', 'me'], data),
  });

  const change = (patch: Partial<UnitPrefs>) => save.mutate({ ...prefs, ...patch });
  const standard = isBrazilDefault(prefs);
  const preview = unitsPreview(prefs);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <div className="flex items-center gap-2">
        <Badge variant={standard ? 'done' : 'lite'}>{standard ? 'padrão' : 'alterado'}</Badge>
        <span className="text-[13px] text-muted-foreground">
          {standard ? 'pelo país: Brasil' : 'você mudou'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] text-foreground">Carga</span>
        <Segmented
          label="Carga"
          options={LOAD_UNIT_OPTIONS}
          value={prefs.loadUnit}
          onChange={(loadUnit) => change({ loadUnit })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] text-foreground">Distância</span>
        <Segmented
          label="Distância"
          options={DISTANCE_UNIT_OPTIONS}
          value={prefs.distanceUnit}
          onChange={(distanceUnit) => change({ distanceUnit })}
        />
      </div>

      <section aria-label="Prévia" className="flex flex-col gap-2.5 rounded-card bg-card p-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Prévia
        </span>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-muted-foreground">Supino reto · recorde</span>
          <b className="tabular-nums text-foreground">{preview.bench}</b>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-muted-foreground">Corrida de domingo</span>
          <b className="tabular-nums text-foreground">{preview.run}</b>
        </div>
        <span className="text-[13px] text-muted-foreground">{preview.equivalence}</span>
      </section>

      <p className="text-[13px] text-muted-foreground">
        Muda só como você vê. O que já foi registrado não muda. A equipe vê na unidade dela.
      </p>

      {!standard && (
        <Button variant="text" size="xl" full onClick={() => save.mutate(BRAZIL_UNITS)}>
          Voltar ao padrão do Brasil
        </Button>
      )}
    </div>
  );
}
