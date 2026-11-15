import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Screen } from '@/components/layout/screen';
import { Button, Segmented, useToast } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';

/**
 * Unidades (pranchas Al-V10/V10b) — réplica de
 * `apps/web/src/components/you/units-screen.tsx`. Salva a cada toque; o banco
 * continua em kg e metros.
 */
export default function UnitsScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const prefs = unitPrefsOf(me.data);

  const save = useMutation({
    mutationFn: (next: UnitPrefs) => usersApi.updateMe(next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['users', 'me'] });
      const before = qc.getQueryData<MeUser>(['users', 'me']);
      if (before) qc.setQueryData<MeUser>(['users', 'me'], { ...before, ...next });
      return { before };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.before) qc.setQueryData(['users', 'me'], ctx.before);
      toast.show({ message: 'Não deu para salvar. Tente de novo.' });
    },
    onSuccess: (data) => qc.setQueryData(['users', 'me'], data),
  });

  const change = (patch: Partial<UnitPrefs>) => save.mutate({ ...prefs, ...patch });
  const standard = isBrazilDefault(prefs);
  const preview = unitsPreview(prefs);

  return (
    <Screen>
      <View className="gap-4 px-6 pb-8 pt-2">
        <View className="flex-row items-center gap-2">
          <View
            className={cn(
              'rounded-full px-2.5 py-0.5',
              standard ? 'border border-success/45' : 'bg-warning/10',
            )}
          >
            <Text
              className={cn(
                'font-sans-semibold text-xs',
                standard ? 'text-success' : 'text-warning',
              )}
            >
              {standard ? 'padrão' : 'alterado'}
            </Text>
          </View>
          <Text className="text-[13px] text-muted-foreground">
            {standard ? 'pelo país: Brasil' : 'você mudou'}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-[15px] text-foreground">Carga</Text>
          <Segmented
            label="Carga"
            options={LOAD_UNIT_OPTIONS}
            value={prefs.loadUnit}
            onChange={(loadUnit) => change({ loadUnit })}
          />
        </View>

        <View className="gap-2">
          <Text className="text-[15px] text-foreground">Distância</Text>
          <Segmented
            label="Distância"
            options={DISTANCE_UNIT_OPTIONS}
            value={prefs.distanceUnit}
            onChange={(distanceUnit) => change({ distanceUnit })}
          />
        </View>

        <View className="gap-2.5 rounded-card bg-card p-4">
          <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-muted-foreground">
            Prévia
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] text-muted-foreground">Supino reto · recorde</Text>
            <Text className="font-sans-bold text-foreground">{preview.bench}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] text-muted-foreground">Corrida de domingo</Text>
            <Text className="font-sans-bold text-foreground">{preview.run}</Text>
          </View>
          <Text className="text-[13px] text-muted-foreground">{preview.equivalence}</Text>
        </View>

        <Text className="text-[13px] text-muted-foreground">
          Muda só como você vê. O que já foi registrado não muda. A equipe vê na unidade dela.
        </Text>

        {!standard ? (
          <Button
            size="xl"
            variant="text"
            className="w-full"
            onPress={() => save.mutate(BRAZIL_UNITS)}
          >
            Voltar ao padrão do Brasil
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
