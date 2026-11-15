import { useState, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react-native';
import {
  professionalApi,
  SHARE_SCOPE_LABEL,
  type ShareScope,
  type StudentReading,
} from '@fatia/api-client';
import { LoadingState, cn } from '@/components/ui';
import { colors } from '@/theme/colors';
import { ROTULO_REFEICAO, formatarDiaCurto, formatarHora } from '@/components/nutrition/helpers';

const SCOPE_ORDER: ShareScope[] = [
  'WORKOUT',
  'NUTRITION',
  'MEAL_PHOTOS',
  'BODY',
  'HABITS',
  'GOALS',
];

function Bloco({
  titulo,
  vazio,
  children,
}: {
  titulo: string;
  vazio: string;
  children: ReactNode[];
}) {
  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-4">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        {titulo}
      </Text>
      {children.length === 0 ? (
        <Text className="text-xs text-muted-foreground">{vazio}</Text>
      ) : (
        <View className="gap-1.5">{children}</View>
      )}
    </View>
  );
}

function Linha({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
      <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
        {titulo}
      </Text>
      <Text className="ml-3 text-xs font-bold text-muted-foreground">{detalhe}</Text>
    </View>
  );
}

function ReadingBody({ reading }: { reading: StudentReading }) {
  switch (reading.scope) {
    case 'WORKOUT':
      return (
        <View className="gap-3">
          <Bloco titulo="Planos" vazio="Nenhum plano montado.">
            {reading.plans.map((p) => (
              <Linha key={p.id} titulo={p.name} detalhe={`${p.exercises.length} exercícios`} />
            ))}
          </Bloco>
          <Bloco titulo="Sessões mais recentes" vazio="Nenhum treino registrado ainda.">
            {reading.sessions.map((s) => (
              <Linha
                key={s.id}
                titulo={new Date(s.startedAt).toLocaleDateString('pt-BR')}
                detalhe={s.completedAt ? 'concluído' : 'em andamento'}
              />
            ))}
          </Bloco>
        </View>
      );
    case 'NUTRITION':
      return (
        <Bloco titulo="Dias registrados" vazio="Nenhum dia com refeição registrada.">
          {reading.history.series.map((d) => (
            <Linha key={d.date} titulo={d.date} detalhe={`${Math.round(d.kcal)} kcal`} />
          ))}
        </Bloco>
      );
    case 'BODY':
      return (
        <Bloco titulo="Peso" vazio="Nenhuma pesagem no período.">
          {reading.weight.points.map((p) => (
            <Linha key={p.date} titulo={p.date} detalhe={`${p.weightKg} kg`} />
          ))}
        </Bloco>
      );
    case 'HABITS':
      return (
        <View className="gap-3">
          <Bloco titulo="Passos" vazio="Sem registro de passos.">
            {reading.steps.points.map((p) => (
              <Linha key={p.date} titulo={p.date} detalhe={String(p.steps)} />
            ))}
          </Bloco>
          <Bloco titulo="Água" vazio="Sem registro de água.">
            {reading.water.points.map((p) => (
              <Linha key={p.date} titulo={p.date} detalhe={`${p.totalMl} ml`} />
            ))}
          </Bloco>
        </View>
      );
    case 'MEAL_PHOTOS':
      // Só as fotos: os números ficam em Alimentação (ADR 038). URL assinada e curta.
      return (
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
            Fotos das refeições
          </Text>
          {reading.photos.length === 0 ? (
            <Text className="text-xs text-muted-foreground">Nenhuma foto guardada no período.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {reading.photos.map((p) => {
                const label = `${ROTULO_REFEICAO[p.mealType]}, ${formatarDiaCurto(p.eatenAt.slice(0, 10))} ${formatarHora(p.eatenAt)}`;
                return (
                  <View key={p.mealId} className="w-[48%] overflow-hidden rounded-xl bg-muted">
                    {p.photo.url ? (
                      <Image
                        source={{ uri: p.photo.url }}
                        accessibilityLabel={label}
                        style={{ width: '100%', aspectRatio: 4 / 3 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="p-4 text-xs text-muted-foreground">Foto indisponível</Text>
                    )}
                    <Text className="px-2 py-1.5 text-[11px] text-muted-foreground">{label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      );
    case 'GOALS':
      return (
        <Bloco titulo="Metas" vazio="Nenhuma meta cadastrada.">
          {reading.goals.map((m) => (
            <Linha key={m.id} titulo={m.title} detalhe={`${m.targetValue} ${m.unit}`} />
          ))}
        </Bloco>
      );
  }
}

/**
 * Equivalente de `apps/web/src/components/sharing/member-reading.tsx`: o que
 * um membro compartilha com quem olha, uma categoria por vez — cada troca é
 * uma leitura própria na API e uma linha na trilha do membro.
 */
export function MemberReading({
  membershipId,
  granted,
}: {
  membershipId: string;
  granted: ShareScope[];
}) {
  const [scope, setScope] = useState<ShareScope | null>(null);
  const ativo = scope ?? SCOPE_ORDER.find((s) => granted.includes(s)) ?? null;
  const leitura = useQuery({
    queryKey: ['professional', 'student', membershipId, ativo],
    queryFn: () => professionalApi.readStudent(membershipId, ativo as ShareScope),
    // Sem categoria liberada não há o que pedir: a tentativa negada iria para a
    // trilha do membro como se fosse sondagem.
    enabled: ativo !== null,
  });

  if (granted.length === 0) {
    return (
      <View className="items-center gap-2 rounded-2xl border border-dashed border-border p-6">
        <Lock size={20} color={colors.mutedForeground} />
        <Text className="text-sm font-bold text-foreground">Nada autorizado</Text>
        <Text className="text-center text-xs text-muted-foreground">
          Esta pessoa ainda não liberou nenhuma categoria para você.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Categorias autorizadas">
        {SCOPE_ORDER.filter((s) => granted.includes(s)).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: s === ativo }}
            onPress={() => setScope(s)}
            className={cn(
              'min-h-[44px] justify-center rounded-xl px-3',
              s === ativo ? 'bg-primary' : 'bg-muted',
            )}
          >
            <Text
              className={cn(
                'text-xs font-extrabold',
                s === ativo ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {SHARE_SCOPE_LABEL[s]}
            </Text>
          </Pressable>
        ))}
      </View>
      {leitura.isLoading ? <LoadingState label="Lendo…" /> : null}
      {leitura.isError ? (
        <Text className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
          Não foi possível ler esta categoria. Se a pessoa revogou a autorização, ela some da lista
          ao recarregar.
        </Text>
      ) : null}
      {leitura.data ? (
        <>
          <ReadingBody reading={leitura.data.reading} />
          <Text className="text-[11px] text-muted-foreground">
            {`Datas no fuso da pessoa (${leitura.data.timezone}).`}
          </Text>
        </>
      ) : null}
    </View>
  );
}
