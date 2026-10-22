'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { equipmentLabel, filterCustomEquipment, groupedEquipmentOptions } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/**
 * Réplica de `apps/mobile/src/components/workout/equipment-chooser.tsx`: a
 * lista de equipamentos em categorias, comum ao painel da academia (marca
 * vários) e aos editores de exercício (escolhem um). A busca, as categorias e
 * a validação vêm do `@fatia/api-client`.
 */

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
    <span
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border text-xs font-semibold',
        on ? 'border-primary bg-primary/10 text-primary' : 'border-subtle',
      )}
    >
      <button
        type="button"
        role={role}
        aria-checked={on}
        disabled={disabled || !onPress}
        onClick={onPress}
        className={cn(
          'min-h-9 rounded-full px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
          onRemove && 'pr-1',
        )}
      >
        {label}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remover ${label}`}
          onClick={onRemove}
          className="flex h-9 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase text-muted-foreground">{title}</h3>
        {hint && <span className="text-xs text-primary">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * Não rola nem tem campo de busca: quem usa decide onde fica a busca (no
 * topo do modal, ou o próprio campo do exercício pessoal).
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
  const ownItems = filterCustomEquipment(custom, query);
  const groups = groupedEquipmentOptions(query);
  // "Peso corporal" e "Outro" não estão na lista do api-client: a mesma busca
  // sem acento vale para eles pelo filtro dos próprios.
  const extraLabels = filterCustomEquipment(
    extra.map((e) => e.label),
    query,
  );
  const extras = extra.filter((e) => extraLabels.includes(e.label));

  if (!ownItems.length && !groups.length && !extras.length) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nenhum equipamento com esse nome na lista.
      </p>
    );
  }

  const chip = (key: string, label: string) => (
    <EquipmentChip
      key={key}
      label={label}
      on={isSelected(key)}
      disabled={disabled}
      role={role}
      onPress={() => onPick(key)}
    />
  );

  return (
    <div className="space-y-4">
      {ownItems.length > 0 && (
        <Section title={customTitle}>{ownItems.map((c) => chip(c, c))}</Section>
      )}
      {extras.length > 0 && (
        <Section title="Sem aparelho">{extras.map((e) => chip(e.key, e.label))}</Section>
      )}
      {groups.map((g) => {
        const checked = g.items.filter((i) => isSelected(i.key)).length;
        return (
          <Section
            key={g.key}
            title={g.label}
            hint={!single && checked ? `${checked} marcado${checked > 1 ? 's' : ''}` : undefined}
          >
            {g.items.map((i) => chip(i.key, i.label))}
          </Section>
        );
      })}
    </div>
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
  const all = [...equipment.map(equipmentLabel), ...custom];
  if (!all.length) {
    return <p className="text-sm text-muted-foreground">Nenhum equipamento marcado ainda.</p>;
  }
  const rest = all.length - limit;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Equipamento marcado">
      {all.slice(0, limit).map((label) => (
        <li
          key={label}
          className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold"
        >
          {label}
        </li>
      ))}
      {rest > 0 && (
        <li className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          {`+${rest}`}
        </li>
      )}
    </ul>
  );
}
