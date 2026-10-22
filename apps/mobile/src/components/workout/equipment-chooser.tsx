import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { equipmentLabel, filterCustomEquipment, groupedEquipmentOptions } from '@fatia/api-client';
import { cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/** Um equipamento em pílula: marcado ou não, e com "×" quando dá para tirar. */
export function EquipmentChip({
  label,
  on,
  onPress,
  onRemove,
  disabled,
  role = 'checkbox',
}: {
  label: string;
  on: boolean;
  onPress?: () => void;
  /** Só no equipamento próprio, para a academia apagar o que ela criou. */
  onRemove?: () => void;
  disabled?: boolean;
  role?: 'checkbox' | 'radio';
}) {
  return (
    <View
      className={cn(
        'min-h-[40px] flex-row items-center rounded-full border',
        on ? 'border-primary bg-accent' : 'border-border',
      )}
    >
      <Pressable
        disabled={disabled || !onPress}
        accessibilityRole={role}
        accessibilityState={{ checked: on, disabled: disabled || !onPress }}
        accessibilityLabel={label}
        onPress={onPress}
        className={cn('min-h-[40px] justify-center px-3 active:opacity-80', onRemove && 'pr-1')}
      >
        <Text className={cn('text-xs font-semibold', on ? 'text-primary' : 'text-foreground')}>
          {label}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remover ${label}`}
          hitSlop={8}
          onPress={onRemove}
          className="h-10 w-9 items-center justify-center active:opacity-60"
        >
          <X size={14} color={cores.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text
          accessibilityRole="header"
          className="text-xs font-bold uppercase text-muted-foreground"
        >
          {title}
        </Text>
        {hint ? <Text className="text-xs text-primary">{hint}</Text> : null}
      </View>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

/**
 * A lista de equipamentos em categorias, filtrada por `query` — o corpo
 * comum do painel da academia (marca vários) e dos editores de exercício
 * (escolhem um).
 *
 * Não rola nem tem campo de busca: quem usa decide se está num drawer
 * (`DrawerScrollView` e `DrawerTextInput`) ou numa tela comum.
 */
export function EquipmentChooser({
  query,
  isSelected,
  onPick,
  custom = [],
  customTitle = 'Da academia',
  extra = [],
  disabled,
  single,
}: {
  query: string;
  isSelected: (key: string) => boolean;
  onPick: (key: string) => void;
  /** Os equipamentos próprios da academia, em seção à parte e primeiro. */
  custom?: readonly string[];
  customTitle?: string;
  /** Opções fora da lista que o editor de exercício oferece (peso corporal, outro). */
  extra?: readonly { key: string; label: string }[];
  disabled?: boolean;
  /** Escolha única: o leitor de tela ouve "opção", e não "caixa de seleção". */
  single?: boolean;
}) {
  const role = single ? 'radio' : 'checkbox';
  const proprios = filterCustomEquipment(custom, query);
  const grupos = groupedEquipmentOptions(query);
  const extras = extra.filter(
    (e) => !query.trim() || e.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (!proprios.length && !grupos.length && !extras.length) {
    return (
      <Text className="py-2 text-sm text-muted-foreground">
        Nenhum equipamento com esse nome na lista.
      </Text>
    );
  }

  return (
    <View className="gap-4">
      {proprios.length ? (
        <Section title={customTitle}>
          {proprios.map((c) => (
            <EquipmentChip
              key={`proprio-${c}`}
              label={c}
              on={isSelected(c)}
              disabled={disabled}
              role={role}
              onPress={() => onPick(c)}
            />
          ))}
        </Section>
      ) : null}
      {extras.length ? (
        <Section title="Sem aparelho">
          {extras.map((e) => (
            <EquipmentChip
              key={`extra-${e.key}`}
              label={e.label}
              on={isSelected(e.key)}
              disabled={disabled}
              role={role}
              onPress={() => onPick(e.key)}
            />
          ))}
        </Section>
      ) : null}
      {grupos.map((g) => {
        const marcados = g.items.filter((i) => isSelected(i.key)).length;
        return (
          <Section
            key={g.key}
            title={g.label}
            hint={!single && marcados ? `${marcados} marcado${marcados > 1 ? 's' : ''}` : undefined}
          >
            {g.items.map((i) => (
              <EquipmentChip
                key={i.key}
                label={i.label}
                on={isSelected(i.key)}
                disabled={disabled}
                role={role}
                onPress={() => onPick(i.key)}
              />
            ))}
          </Section>
        );
      })}
    </View>
  );
}

/** As pílulas do que já está marcado, para o resumo fora do escolhedor. */
export function EquipmentSummary({
  equipment,
  custom,
  limit = 12,
}: {
  equipment: readonly string[];
  custom: readonly string[];
  limit?: number;
}) {
  const todos = [...equipment.map(equipmentLabel), ...custom];
  if (!todos.length) {
    return <Text className="text-sm text-muted-foreground">Nenhum equipamento marcado ainda.</Text>;
  }
  const resto = todos.length - limit;
  return (
    <View className="flex-row flex-wrap gap-2">
      {todos.slice(0, limit).map((label) => (
        <View key={label} className="rounded-full border border-border px-3 py-1.5">
          <Text className="text-xs font-semibold text-foreground">{label}</Text>
        </View>
      ))}
      {resto > 0 ? (
        <View className="rounded-full bg-muted px-3 py-1.5">
          <Text className="text-xs font-semibold text-muted-foreground">{`+${resto}`}</Text>
        </View>
      ) : null}
    </View>
  );
}
