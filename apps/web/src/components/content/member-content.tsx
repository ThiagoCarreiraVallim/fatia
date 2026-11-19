import Link from 'next/link';
import { Apple, Dumbbell, Pin } from 'lucide-react';
import {
  gymEquipmentLabels,
  markdownLitePlainText,
  memberTemplateLine,
  tipEyebrow,
  type GroupExercise,
  type GroupTip,
  type GymEquipmentState,
  type PlanTemplate,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { RowChevron } from './content-ui';

/**
 * As peças da aba Conteúdo do membro (Cm-12, #396), equivalente de
 * `apps/mobile/src/components/content/member-content.tsx`. A bancada da equipe
 * continua com `content-cards.tsx`.
 */

const ROW =
  'flex min-h-11 items-center gap-3 rounded-[18px] bg-card p-3 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Plano na lista: o ícone do tipo, o título e "treino · 4 exercícios · intermediário · Bruno". */
export function MemberTemplateRow({ template, href }: { template: PlanTemplate; href: string }) {
  const treino = template.kind === 'WORKOUT';
  const Icone = treino ? Dumbbell : Apple;
  return (
    <Link href={href} className={ROW}>
      <span
        aria-hidden
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          treino ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning',
        )}
      >
        <Icone className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{template.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {memberTemplateLine(template)}
        </span>
      </span>
      <RowChevron />
    </Link>
  );
}

/** Dica na lista: "Fixada · hábitos", o título e o começo do texto. Abre a dica inteira. */
export function MemberTipCard({ tip, href }: { tip: GroupTip; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-2xl bg-card p-4 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs',
          tip.pinned ? 'font-bold text-primary' : 'text-muted-foreground',
        )}
      >
        {tip.pinned && <Pin className="h-3.5 w-3.5" aria-hidden />}
        {tipEyebrow(tip)}
      </span>
      <span className="font-semibold">{tip.title}</span>
      <span className="line-clamp-2 text-xs text-muted-foreground">
        {markdownLitePlainText(tip.body)}
      </span>
    </Link>
  );
}

/** "pernas · máquina · guia da academia". */
export function guideLine(e: Pick<GroupExercise, 'muscleGroup' | 'equipment'>): string {
  return [e.muscleGroup, e.equipment, 'guia da academia'].filter(Boolean).join(' · ');
}

/** Guia na lista: a primeira foto (ou o ícone), o nome e a linha do guia. */
export function GuideRow({ guide, href }: { guide: GroupExercise; href: string }) {
  const foto = guide.photos[0]?.url;
  return (
    <Link href={href} className={ROW}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img src={foto} alt="" className="h-[52px] w-[52px] shrink-0 rounded-[14px] object-cover" />
      ) : (
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-muted">
          <Dumbbell className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{guide.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{guideLine(guide)}</span>
      </span>
      <RowChevron />
    </Link>
  );
}

/** "Equipamentos da academia": o que ela tem, em fichas, só para ler. */
export function GymEquipmentCard({ state }: { state: GymEquipmentState }) {
  const itens = gymEquipmentLabels(state);
  if (!itens.length) return null;
  return (
    <section aria-label="Equipamentos da academia" className="space-y-2 rounded-2xl bg-muted p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Equipamentos da academia
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {itens.map((e) => (
          <li key={e} className="rounded-full border border-subtle px-3 py-1 text-xs">
            {e}
          </li>
        ))}
      </ul>
    </section>
  );
}
