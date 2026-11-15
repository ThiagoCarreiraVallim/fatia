'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  dailyGoalTarget,
  dailyGoalValue,
  dailyGoalVisual,
  type DailyGoal,
} from '@fatia/api-client';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Bar, ChipIcon, TONE_BAR } from './parts';

const ghostBtn =
  'anim-press inline-flex h-[52px] items-center justify-center gap-2 rounded-field bg-muted px-6 text-[15px] font-bold text-foreground';

/**
 * "Metas de hoje" (prancha Al-H5-Metas): uma linha por meta, com a marca de
 * atingida, e os atalhos Ajustar, Pessoais e Compartilhar meu dia. Abre pelo
 * chip "Metas N/M" do topo do Hoje.
 */
export function GoalsSheet({
  open,
  onOpenChange,
  goals,
  onWater,
  onSteps,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: { met: number; total: number; items: DailyGoal[] };
  onWater: () => void;
  onSteps: () => void;
  onShare: () => void;
}) {
  const router = useRouter();

  function go(goal: DailyGoal) {
    const target = dailyGoalTarget(goal.key);
    onOpenChange(false);
    if (target.kind === 'water') onWater();
    else if (target.kind === 'steps') onSteps();
    else router.push(target.href);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="gap-4 px-6 pb-8 pt-3">
        <div className="flex items-center justify-between">
          <DrawerTitle className="font-display text-h2">Metas de hoje</DrawerTitle>
          <span className="inline-flex h-[22px] items-center rounded-pill bg-primary-soft px-2.5 text-[11px] font-extrabold uppercase text-primary">
            {goals.met} de {goals.total}
          </span>
        </div>
        <DrawerDescription className="sr-only">
          {goals.met} de {goals.total} metas atingidas hoje.
        </DrawerDescription>
        {goals.items.length === 0 ? (
          <p className="rounded-card bg-muted p-5 text-b2 text-muted-foreground">
            Você ainda não tem metas para hoje. Defina suas metas do dia para acompanhar aqui.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-card bg-muted">
            {goals.items.map((g, i) => {
              const v = dailyGoalVisual(g);
              return (
                <li key={g.key} className="[&+&]:shadow-[inset_0_1px_0_hsl(var(--border))]">
                  <button
                    type="button"
                    onClick={() => go(g)}
                    aria-label={`${g.label}: ${dailyGoalValue(g)}${g.met ? ', atingida' : ''}`}
                    className="flex min-h-[60px] w-full items-center gap-3.5 px-[18px] py-3.5 text-left"
                  >
                    <ChipIcon icon={v.icon} tone={v.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">{g.label}</span>
                        <span className="text-xs tabular-nums text-faint">{dailyGoalValue(g)}</span>
                      </span>
                      <Bar
                        percent={g.percent}
                        color={g.key === 'kcal' ? 'bg-foreground' : TONE_BAR[v.tone]}
                        index={i}
                        className="mt-2"
                      />
                    </span>
                    {g.met && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/nutrition/goals" onClick={() => onOpenChange(false)} className={ghostBtn}>
            <Icon name="sliders" size={16} />
            Ajustar
          </Link>
          <Link href="/goals" onClick={() => onOpenChange(false)} className={ghostBtn}>
            <Icon name="target" size={16} />
            Pessoais
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onShare();
          }}
          className="anim-press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-field bg-primary text-[15px] font-bold text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.6)]"
        >
          <Icon name="share" size={16} />
          Compartilhar meu dia
        </button>
      </DrawerContent>
    </Drawer>
  );
}
