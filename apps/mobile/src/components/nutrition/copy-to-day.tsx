import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { copyTargetDays, dayLabel, shiftDay } from '@fatia/api-client';
import { cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/** "qua", "qui": o dia da semana em cima do número. */
function weekdayShort(iso: string): string {
  return new Date(`${iso}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
}

/**
 * Réplica de `apps/web/src/components/nutrition/copy-to-day.tsx`.
 *
 * O dia de destino anda nas setas, como o navegador de data da tela, em vez de
 * um seletor de calendário: o caso comum é ontem → hoje ou hoje → amanhã, a um
 * ou dois toques, e o app não carrega dependência de date picker por isso.
 */
export function CopyToDay({
  sourceDate,
  diaPadrao,
  hoje,
  pendente,
  erro,
  feito,
  onCopiar,
  onVer,
}: {
  /** O dia de origem: com ele, os próximos dias viram chips (prancha Al-N9). */
  sourceDate?: string;
  diaPadrao: string;
  hoje: string;
  pendente: boolean;
  erro: string | null;
  /** O que foi feito, e para qual dia. */
  feito: { texto: string; dia: string } | null;
  onCopiar: (dia: string) => void;
  onVer: (dia: string) => void;
}) {
  const [dia, setDia] = useState(diaPadrao);
  const [outroDia, setOutroDia] = useState(!sourceDate);
  const rotulo = dayLabel(dia, hoje);

  return (
    <View className="gap-3">
      {sourceDate ? (
        <>
          <Text className="font-sans-bold text-xs uppercase tracking-[0.72px] text-muted-foreground">
            Para
          </Text>
          {/* Os próximos dias em blocos (prancha Al-N9): o escolhido em verde. */}
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Para"
            className="flex-row gap-1.5"
          >
            {copyTargetDays(sourceDate, hoje).map((day) => {
              const on = day === dia;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={dayLabel(day, hoje)}
                  onPress={() => setDia(day)}
                  className={cn(
                    'h-16 flex-1 items-center justify-center gap-0.5 rounded-field',
                    on && 'bg-primary',
                  )}
                >
                  <Text
                    className={cn(
                      'text-[13px]',
                      on ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {weekdayShort(day)}
                  </Text>
                  <Text
                    className={cn(
                      'font-display text-base',
                      on ? 'text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {Number(day.slice(8))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!outroDia ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setOutroDia(true)}
              className="min-h-9 justify-center self-start"
            >
              <Text className="font-sans-semibold text-sm text-primary">Outro dia</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {outroDia ? (
        <>
          <Text className="text-sm font-medium text-foreground">
            {sourceDate ? 'Outro dia' : 'Dia de destino'}
          </Text>
          <View className="flex-row items-center justify-between rounded-field bg-muted p-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dia de destino anterior"
              onPress={() => setDia(shiftDay(dia, -1))}
              className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
            >
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>
            <Text className="text-sm font-medium capitalize text-foreground">{rotulo}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próximo dia de destino"
              onPress={() => setDia(shiftDay(dia, 1))}
              className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
            >
              <ChevronRight size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: pendente }}
        disabled={pendente}
        onPress={() => onCopiar(dia)}
        className={cn(
          'h-14 items-center justify-center rounded-pill bg-primary',
          pendente && 'opacity-40',
        )}
      >
        <Text className="font-sans-bold text-[15px] text-primary-foreground">
          {pendente ? 'Copiando...' : `Copiar para ${rotulo}`}
        </Text>
      </Pressable>
      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}
      {feito ? (
        <View className="flex-row items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
          <View accessibilityRole="text" className="flex-1 flex-row items-center gap-2">
            <Check size={16} color={colors.primaryText} />
            <Text className="text-sm text-primary">{feito.texto}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => onVer(feito.dia)}
            hitSlop={8}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm font-medium text-primary underline">
              {`Ver ${dayLabel(feito.dia, hoje)}`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
