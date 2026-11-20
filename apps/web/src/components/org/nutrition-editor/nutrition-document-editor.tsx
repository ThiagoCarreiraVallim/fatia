'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  amountLine,
  documentTotals,
  foodSnap,
  formatInteger,
  groupChip,
  groupOutliers,
  groupProblem,
  groupUsage,
  groupUsageLabel,
  KEY_MACRO_LABEL,
  KEY_MACROS,
  macroLine,
  MAX_EQUIVALENCE_GROUPS,
  MAX_GROUP_FOODS,
  MAX_GROUP_NAME,
  MAX_MEAL_NAME,
  MAX_MEAL_OPTIONS,
  MAX_PLAN_MEALS,
  moveAt,
  newKey,
  nextGroupName,
  nutritionDocumentWarnings,
  sumMacros,
  targetStatus,
  type EquivalenceGroupDoc,
  type Food,
  type KeyMacro,
  type Macros,
  type NutritionDocument,
  type NutritionFoodSnap,
  type NutritionItemDoc,
  type NutritionMealDoc,
  type NutritionTargets,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/selection';
import { NumField } from '@/components/org/plan-editor/num-field';
import { cn } from '@/lib/utils';
import { AmountField, selectClass } from './amount-field';
import { FoodSearch, pickedSnap } from './food-search';

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30';

const kcalText = (n: number) => `${formatInteger(Math.round(n))} kcal`;
const pcg = (m: Macros) =>
  `P ${formatInteger(m.proteinG)} · C ${formatInteger(m.carbsG)} · G ${formatInteger(m.fatG)}`;

const TARGET_FIELDS: { key: keyof NutritionTargets; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calorias por dia', unit: 'kcal' },
  { key: 'proteinG', label: 'Proteína', unit: 'g' },
  { key: 'carbsG', label: 'Carboidrato', unit: 'g' },
  { key: 'fatG', label: 'Gordura', unit: 'g' },
];

const NEW_GROUP = 'new';

/** O macro que mais pesa nas calorias do alimento: a chave de um grupo novo. */
function dominantMacro(f: Macros): KeyMacro {
  const parts: [KeyMacro, number][] = [
    ['carbs', f.carbsG * 4],
    ['protein', f.proteinG * 4],
    ['fat', f.fatG * 9],
  ];
  parts.sort((a, b) => b[1] - a[1]);
  return parts[0]![1] > 0 ? parts[0]![0] : 'kcal';
}

const bareSnap = (i: NutritionFoodSnap): NutritionFoodSnap => ({
  foodId: i.foodId,
  groupId: i.groupId,
  foodName: i.foodName,
  grams: i.grams,
  kcal: i.kcal,
  proteinG: i.proteinG,
  carbsG: i.carbsG,
  fatG: i.fatG,
  nutrients: i.nutrients,
  portionLabel: i.portionLabel,
  portionQuantity: i.portionQuantity,
});

const TONE = {
  ok: 'border-success/40 text-success',
  over: 'border-warning/50 text-warning',
  under: 'border-warning/50 text-warning',
} as const;

/**
 * O editor do plano alimentar (#407, Pn-24): metas do dia, o total contra a
 * meta, as refeições com opções e os grupos de equivalentes no painel ao
 * lado. Serve ao modelo da biblioteca e à cópia de um aluno (`copy`).
 */
export function NutritionDocumentEditor({
  value,
  onChange,
  copy = false,
}: {
  value: NutritionDocument;
  onChange: (next: NutritionDocument) => void;
  /** Na cópia de um aluno não há "ajustar a cada aluno". */
  copy?: boolean;
}) {
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const total = documentTotals(value, chosen);
  const status = targetStatus(total.kcal, value.targets);
  const warnings = nutritionDocumentWarnings(value);

  const setMeals = (meals: NutritionMealDoc[]) => onChange({ ...value, meals });
  const setMeal = (mi: number, meal: NutritionMealDoc) =>
    setMeals(value.meals.map((m, i) => (i === mi ? meal : m)));
  const setGroups = (groups: EquivalenceGroupDoc[]) => onChange({ ...value, groups });

  const setTarget = (k: keyof NutritionTargets, n: number | undefined) => {
    const base = value.targets ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    onChange({ ...value, targets: { ...base, [k]: n ?? 0 } });
  };

  /** Grupo novo a partir de um item: o alimento dele é a referência. */
  const groupFromItem = (mi: number, oi: number, ii: number) => {
    const it = value.meals[mi]!.options[oi]!.items[ii]!;
    const keyMacro = dominantMacro(it);
    const group: EquivalenceGroupDoc = {
      key: newKey(),
      name: nextGroupName(value.groups, keyMacro),
      keyMacro,
      foods: [bareSnap(it)],
    };
    const meals = value.meals.map((m, a) =>
      a !== mi
        ? m
        : {
            ...m,
            options: m.options.map((o, b) =>
              b !== oi
                ? o
                : {
                    items: o.items.map((x, c) => (c === ii ? { ...x, groupKey: group.key } : x)),
                  },
            ),
          },
    );
    onChange({ ...value, meals, groups: [...value.groups, group] });
    setOpenGroup(group.key);
  };

  const addGroup = () => {
    const group: EquivalenceGroupDoc = {
      key: newKey(),
      name: nextGroupName(value.groups, 'carbs'),
      keyMacro: 'carbs',
      foods: [],
    };
    setGroups([...value.groups, group]);
    setOpenGroup(group.key);
  };

  const removeGroup = (key: string) => {
    onChange({
      ...value,
      groups: value.groups.filter((g) => g.key !== key),
      meals: value.meals.map((m) => ({
        ...m,
        options: m.options.map((o) => ({
          items: o.items.map((i) => (i.groupKey === key ? { ...i, groupKey: null } : i)),
        })),
      })),
    });
    setOpenGroup(null);
  };

  const shownGroup = value.groups.find((g) => g.key === openGroup) ?? value.groups[0] ?? null;

  return (
    <div className="space-y-4">
      <section
        aria-label="Metas do dia"
        className="grid grid-cols-2 gap-4 rounded-2xl border border-subtle bg-card p-4 md:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]"
      >
        {TARGET_FIELDS.map((f) => (
          <div key={f.key} className="flex items-end gap-2">
            <NumField
              label={f.label}
              className="min-w-0 max-w-32 flex-1"
              max={f.key === 'kcal' ? 10000 : 1000}
              value={value.targets && value.targets[f.key] > 0 ? value.targets[f.key] : undefined}
              onChange={(n) => setTarget(f.key, n)}
            />
            <span className="pb-2.5 text-xs text-muted-foreground">{f.unit}</span>
          </div>
        ))}
        {!copy && (
          <div className="col-span-2 space-y-1 md:col-span-4 xl:col-span-1 xl:border-l xl:border-subtle xl:pl-4">
            <span className="block text-xs text-muted-foreground">Ao enviar</span>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Ajustar às metas de cada aluno</span>
              <Switch
                label="Ajustar às metas de cada aluno"
                checked={value.adjustToStudent}
                onCheckedChange={(on) => onChange({ ...value, adjustToStudent: on })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {value.adjustToStudent
                ? 'As quantidades seguem as calorias de cada um, quando a Alimentação dele está aberta para a equipe.'
                : 'Todos recebem as mesmas quantidades.'}
            </p>
          </div>
        )}
      </section>

      <section
        aria-label="Total das refeições"
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-3',
          status && status.tone !== 'ok' ? 'border-warning/50' : 'border-subtle',
        )}
      >
        <span className="text-xs text-muted-foreground">Total das refeições</span>
        <span className="font-display text-xl font-bold tabular-nums">{kcalText(total.kcal)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{pcg(total)}</span>
        {status && (
          <span
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-xs font-medium',
              TONE[status.tone],
            )}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {status.label}
          </span>
        )}
      </section>

      {warnings.length > 0 && (
        <ul
          aria-label="Avisos"
          className="space-y-0.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"
        >
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="space-y-4">
          {value.meals.map((m, mi) => (
            <MealCard
              key={m.key}
              meal={m}
              index={mi}
              count={value.meals.length}
              groups={value.groups}
              option={Math.min(chosen[m.key] ?? 0, m.options.length - 1)}
              onOption={(oi) => setChosen({ ...chosen, [m.key]: oi })}
              onChange={(next) => setMeal(mi, next)}
              onMove={(dir) => setMeals(moveAt(value.meals, mi, dir))}
              onRemove={() => setMeals(value.meals.filter((_, i) => i !== mi))}
              onOpenGroup={setOpenGroup}
              onNewGroup={(oi, ii) => groupFromItem(mi, oi, ii)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={value.meals.length >= MAX_PLAN_MEALS}
            onClick={() =>
              setMeals([
                ...value.meals,
                { key: newKey(), name: '', time: null, mealType: null, options: [{ items: [] }] },
              ])
            }
          >
            <Plus aria-hidden />
            Adicionar refeição
          </Button>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4">
          {value.groups.length > 0 && (
            <div
              role="group"
              className="flex flex-wrap gap-1.5"
              aria-label="Grupos de equivalentes"
            >
              {value.groups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={shownGroup?.key === g.key}
                  onClick={() => setOpenGroup(g.key)}
                  className={cn(
                    'rounded-chip border px-2.5 py-1 text-xs font-medium',
                    shownGroup?.key === g.key
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-subtle text-muted-foreground hover:bg-muted',
                  )}
                >
                  {g.name}
                </button>
              ))}
              <button
                type="button"
                onClick={addGroup}
                disabled={value.groups.length >= MAX_EQUIVALENCE_GROUPS}
                className="flex items-center gap-1 rounded-chip border border-dashed border-subtle px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <Plus size={12} aria-hidden />
                Novo grupo
              </button>
            </div>
          )}
          {shownGroup ? (
            <GroupPanel
              key={shownGroup.key}
              group={shownGroup}
              usage={groupUsage(value, shownGroup.key)}
              onChange={(g) => setGroups(value.groups.map((x) => (x.key === g.key ? g : x)))}
              onRemove={() => removeGroup(shownGroup.key)}
            />
          ) : (
            <section
              aria-label="Equivalentes"
              className="space-y-2 rounded-2xl border border-subtle bg-card p-4 text-center"
            >
              <Layers aria-hidden className="mx-auto text-muted-foreground" />
              <h2 className="text-sm font-semibold">Grupos de equivalentes</h2>
              <p className="text-xs text-muted-foreground">
                Um grupo junta alimentos com a mesma quantidade de um macro (±10%). No item, o aluno
                escolhe entre eles em Trocar.
              </p>
              <Button type="button" size="sm" onClick={addGroup}>
                <Plus aria-hidden />
                Novo grupo
              </Button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function MealCard({
  meal,
  index,
  count,
  groups,
  option,
  onOption,
  onChange,
  onMove,
  onRemove,
  onOpenGroup,
  onNewGroup,
}: {
  meal: NutritionMealDoc;
  index: number;
  count: number;
  groups: EquivalenceGroupDoc[];
  option: number;
  onOption: (oi: number) => void;
  onChange: (next: NutritionMealDoc) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onOpenGroup: (key: string) => void;
  onNewGroup: (oi: number, ii: number) => void;
}) {
  const nameId = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const label = meal.name.trim() || `Refeição ${index + 1}`;
  const items = meal.options[option]?.items ?? [];
  const kcal = sumMacros(items).kcal;

  const setItems = (next: NutritionItemDoc[]) =>
    onChange({
      ...meal,
      options: meal.options.map((o, i) => (i === option ? { items: next } : o)),
    });
  const setItem = (ii: number, it: NutritionItemDoc) =>
    setItems(items.map((x, i) => (i === ii ? it : x)));

  const addFood = (f: Food) => {
    const it: NutritionItemDoc = { ...pickedSnap(f), key: newKey(), groupKey: null };
    setItems([...items, it]);
  };

  return (
    <section aria-label={label} className="rounded-2xl border border-subtle bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-subtle p-3 sm:p-4">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <Label htmlFor={nameId} className="sr-only">
            Nome da refeição
          </Label>
          <Input
            id={nameId}
            value={meal.name}
            maxLength={MAX_MEAL_NAME}
            placeholder="Ex.: Ceia"
            onChange={(e) => onChange({ ...meal, name: e.target.value })}
            className="h-10 min-w-0 flex-1 font-semibold"
          />
          <Input
            type="time"
            aria-label={`Horário de ${label}`}
            value={meal.time ?? ''}
            onChange={(e) => onChange({ ...meal, time: e.target.value || null })}
            className="h-10 w-28 shrink-0"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{kcalText(kcal)}</span>
        <span className="flex items-center">
          <button
            type="button"
            aria-label={`Subir ${label}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className={iconButton}
          >
            <ArrowUp size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Descer ${label}`}
            disabled={index >= count - 1}
            onClick={() => onMove(1)}
            className={iconButton}
          >
            <ArrowDown size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Apagar ${label}`}
            onClick={onRemove}
            className={cn(iconButton, 'hover:text-danger')}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 sm:px-4">
        <div role="tablist" aria-label={`Opções de ${label}`} className="flex flex-wrap gap-1.5">
          {meal.options.map((_, oi) => (
            <button
              key={oi}
              type="button"
              role="tab"
              aria-selected={oi === option}
              onClick={() => {
                setEditing(null);
                onOption(oi);
              }}
              className={cn(
                'rounded-chip px-3 py-1 text-xs font-semibold',
                oi === option
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {`Opção ${oi + 1}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={meal.options.length >= MAX_MEAL_OPTIONS}
          onClick={() => {
            onChange({ ...meal, options: [...meal.options, { items: [] }] });
            onOption(meal.options.length);
          }}
          className="flex items-center gap-1 rounded-chip px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
        >
          <Plus size={12} aria-hidden />
          Adicionar opção
        </button>
        {meal.options.length > 1 && (
          <button
            type="button"
            onClick={() => {
              onChange({ ...meal, options: meal.options.filter((_, i) => i !== option) });
              onOption(Math.max(0, option - 1));
            }}
            className="ml-auto flex items-center gap-1 rounded-chip px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-danger"
          >
            <X size={12} aria-hidden />
            {`Tirar opção ${option + 1}`}
          </button>
        )}
      </div>

      <div className="p-3 sm:p-4">
        {items.length === 0 ? (
          <p className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
            Nenhum item nesta refeição. O aluno vê &quot;sem sugestão&quot;.
          </p>
        ) : (
          <ul className="divide-y divide-subtle">
            {items.map((it, ii) => {
              const group = groups.find((g) => g.key === it.groupKey) ?? null;
              const open = editing === it.key;
              return (
                <li
                  key={it.key}
                  className={cn('py-2', group && 'border-l-2 border-l-primary/60 pl-2')}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block truncate text-sm font-semibold">{it.foodName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span>{amountLine(it)}</span>
                        <span> · TACO</span>
                      </span>
                    </span>
                    {group ? (
                      <button
                        type="button"
                        aria-label={`Equivalentes: ${groupChip(group)}`}
                        onClick={() => onOpenGroup(group.key)}
                        className="rounded-chip border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        {groupChip(group)}
                      </button>
                    ) : (
                      <span className="rounded-chip border border-subtle px-2 py-0.5 text-xs text-muted-foreground">
                        sem equivalentes
                      </span>
                    )}
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      {kcalText(it.kcal)}
                    </span>
                    <span className="flex">
                      <button
                        type="button"
                        aria-label={`Editar ${it.foodName}`}
                        aria-expanded={open}
                        onClick={() => setEditing(open ? null : it.key)}
                        className={cn(iconButton, open && 'bg-muted text-foreground')}
                      >
                        <SlidersHorizontal size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Tirar ${it.foodName}`}
                        onClick={() => setItems(items.filter((_, i) => i !== ii))}
                        className={cn(iconButton, 'hover:text-danger')}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </span>
                  </div>
                  {open && (
                    <div className="mt-2 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <AmountField value={it} onChange={(next) => setItem(ii, next)} />
                      <div className="space-y-1">
                        <span aria-hidden className="block text-xs text-muted-foreground">
                          Equivalentes
                        </span>
                        <select
                          aria-label={`Equivalentes de ${it.foodName}`}
                          value={it.groupKey ?? ''}
                          onChange={(e) => {
                            if (e.target.value === NEW_GROUP) return onNewGroup(option, ii);
                            const key = e.target.value || null;
                            setItem(ii, { ...it, groupKey: key });
                            if (key) onOpenGroup(key);
                          }}
                          className={selectClass}
                        >
                          <option value="">sem equivalentes</option>
                          {groups.map((g) => (
                            <option key={g.key} value={g.key}>
                              {g.name}
                            </option>
                          ))}
                          {groups.length < MAX_EQUIVALENCE_GROUPS && (
                            <option value={NEW_GROUP}>Novo grupo a partir deste alimento</option>
                          )}
                        </select>
                      </div>
                      <span className="flex">
                        <button
                          type="button"
                          aria-label={`Subir ${it.foodName}`}
                          disabled={ii === 0}
                          onClick={() => setItems(moveAt(items, ii, -1))}
                          className={iconButton}
                        >
                          <ArrowUp size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Descer ${it.foodName}`}
                          disabled={ii >= items.length - 1}
                          onClick={() => setItems(moveAt(items, ii, 1))}
                          className={iconButton}
                        >
                          <ArrowDown size={16} aria-hidden />
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <FoodSearch
            label={`Adicionar alimento em ${label}`}
            exclude={new Set(items.flatMap((i) => (i.foodId !== null ? [i.foodId] : [])))}
            onPick={addFood}
          />
        </div>
      </div>
    </section>
  );
}

function GroupPanel({
  group,
  usage,
  onChange,
  onRemove,
}: {
  group: EquivalenceGroupDoc;
  usage: number;
  onChange: (next: EquivalenceGroupDoc) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const macroId = useId();
  const [editing, setEditing] = useState<number | null>(null);
  const outliers = new Set(groupOutliers(group));
  const problem = groupProblem(group);
  const title = `Equivalentes · ${group.name.trim() || 'grupo sem nome'}`;
  const setFoods = (foods: NutritionFoodSnap[]) => onChange({ ...group, foods });

  return (
    <section aria-label={title} className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        <span className="rounded-chip border border-subtle px-2 py-0.5 text-xs text-muted-foreground">
          {groupUsageLabel(usage)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {`Cada alimento é uma troca com a mesma quantidade de ${KEY_MACRO_LABEL[group.keyMacro]} (±10%). O aluno escolhe em Trocar.`}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
        <div className="space-y-1">
          <Label htmlFor={nameId} className="text-xs text-muted-foreground">
            Nome do grupo
          </Label>
          <Input
            id={nameId}
            value={group.name}
            maxLength={MAX_GROUP_NAME}
            onChange={(e) => onChange({ ...group, name: e.target.value })}
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={macroId} className="text-xs text-muted-foreground">
            Macro-chave
          </Label>
          <select
            id={macroId}
            value={group.keyMacro}
            onChange={(e) => onChange({ ...group, keyMacro: e.target.value as KeyMacro })}
            className={selectClass}
          >
            {KEY_MACROS.map((k) => (
              <option key={k} value={k}>
                {KEY_MACRO_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {group.foods.length > 0 && (
        <ul className="divide-y divide-subtle border-t border-subtle">
          {group.foods.map((f, i) => {
            const open = editing === i;
            return (
              <li key={`${f.foodId}-${i}`} className="py-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.foodName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {amountLine(f)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {kcalText(f.kcal)}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {macroLine(f)}
                    </span>
                    {outliers.has(i) && (
                      <span className="block text-xs font-medium text-warning">fora de ±10%</span>
                    )}
                  </span>
                  <span className="flex">
                    <button
                      type="button"
                      aria-label={`Editar ${f.foodName} no grupo`}
                      aria-expanded={open}
                      onClick={() => setEditing(open ? null : i)}
                      className={cn(iconButton, open && 'bg-muted text-foreground')}
                    >
                      <SlidersHorizontal size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Tirar ${f.foodName} do grupo`}
                      onClick={() => {
                        setEditing(null);
                        setFoods(group.foods.filter((_, j) => j !== i));
                      }}
                      className={cn(iconButton, 'hover:text-danger')}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </span>
                </div>
                {open && (
                  <div className="mt-2 rounded-xl bg-muted/40 p-3">
                    <AmountField
                      value={f}
                      onChange={(next) => setFoods(group.foods.map((x, j) => (j === i ? next : x)))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {problem && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">{problem}</p>
      )}

      {group.foods.length < MAX_GROUP_FOODS && (
        <FoodSearch
          label="Adicionar alimento ao grupo"
          placeholder="Alimento da TACO"
          exclude={new Set(group.foods.flatMap((f) => (f.foodId !== null ? [f.foodId] : [])))}
          onPick={(food) => setFoods([...group.foods, sameKeyAmount(food, group)])}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {`Mesma quantidade de ${KEY_MACRO_LABEL[group.keyMacro]} · ±10%. No envio, a quantidade de cada troca é acertada pelo item.`}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center gap-1.5 text-xs font-medium text-danger hover:underline"
      >
        <Trash2 size={14} aria-hidden />
        Apagar grupo
      </button>
    </section>
  );
}

/**
 * O alimento novo do grupo já entra com a mesma quantidade do macro-chave do
 * primeiro (em gramas, arredondadas a 5); sem referência, 1 porção ou 100 g.
 */
function sameKeyAmount(food: Food, group: EquivalenceGroupDoc): NutritionFoodSnap {
  const ref = group.foods[0];
  const per100: Record<KeyMacro, number> = {
    kcal: food.kcalPer100g,
    protein: food.proteinPer100g,
    carbs: food.carbsPer100g,
    fat: food.fatPer100g,
  };
  const refKey = ref
    ? { kcal: ref.kcal, protein: ref.proteinG, carbs: ref.carbsG, fat: ref.fatG }[group.keyMacro]
    : 0;
  const p = per100[group.keyMacro];
  if (!(refKey > 0) || !(p > 0)) return pickedSnap(food);
  const grams = Math.max(5, Math.round((refKey / p) * 20) * 5);
  return foodSnap(food, Math.min(grams, 2000));
}
