'use client';

import { useState } from 'react';
import {
  WELCOME_COPY,
  initialsOf,
  namesLine,
  welcomeCta,
  welcomeLines,
  welcomePageIcon,
  welcomePosition,
  type WelcomePageInput,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Avatar, AVATAR_TONES } from '@/components/onboarding/onboarding-ui';
import { cn } from '@/lib/utils';

const PLAIN_ICON: Record<ReturnType<typeof welcomePageIcon>, IconName> = {
  users: 'users',
  list: 'list',
  text: 'file',
};

/**
 * As páginas de boas-vindas como o aluno vê (Onb-02b, #410): capa com a marca
 * ou página simples, "1 de N", "Pular", voltar e o botão de baixo. O texto é
 * puro: só "- " vira item de lista. É a mesma tela no onboarding, em Sobre e
 * na prévia do painel (`compact`, dentro da moldura do celular).
 */
export function WelcomePagesView({
  groupName,
  avatarUrl = null,
  pages,
  team,
  index: controlled,
  onIndexChange,
  onSkip,
  onFinish,
  onBackFirst,
  compact = false,
  note = true,
}: {
  groupName: string;
  /** O avatar da comunidade na capa; sem ele, as iniciais na cor da marca. */
  avatarUrl?: string | null;
  pages: WelcomePageInput[];
  team: { name: string }[];
  /** Controlado pelo editor (a aba aberta); sem isso, a tela anda sozinha. */
  index?: number;
  onIndexChange?: (i: number) => void;
  onSkip?: () => void;
  onFinish?: () => void;
  /** Voltar na primeira página (no onboarding, às boas-vindas do Fatia). */
  onBackFirst?: () => void;
  compact?: boolean;
  /** "Dá para rever depois em Comunidade → Sobre". */
  note?: boolean;
}) {
  const [own, setOwn] = useState(0);
  const n = pages.length;
  const i = Math.min(controlled ?? own, Math.max(0, n - 1));
  const go = (next: number) => (onIndexChange ? onIndexChange(next) : setOwn(next));
  const page = pages[i];
  if (!page) return null;
  const cover = page.kind === 'COVER';
  const lines = welcomeLines(page.body);
  const canBack = i > 0 || Boolean(onBackFirst);

  const dots = (
    <div className="flex gap-1.5" aria-hidden>
      {pages.map((_, d) => (
        <i
          key={d}
          className={cn(
            'h-1 flex-1 rounded-[2px]',
            d <= i
              ? cover
                ? 'bg-brand-foreground'
                : 'bg-brand'
              : cover
                ? 'bg-brand-foreground/30'
                : 'bg-surface-3',
          )}
        />
      ))}
    </div>
  );
  const skip = (
    <button
      type="button"
      onClick={onSkip}
      disabled={!onSkip}
      className={cn(
        'flex min-h-11 items-center px-1 font-bold disabled:cursor-default',
        compact ? 'text-xs' : 'text-sm',
        cover ? 'text-brand-foreground' : 'text-muted-foreground',
      )}
    >
      {WELCOME_COPY.skip}
    </button>
  );

  return (
    <section
      aria-label={`Boas-vindas da ${groupName}`}
      className={cn('flex flex-1 flex-col', compact ? 'gap-2.5' : 'gap-4')}
    >
      {cover ? (
        <>
          <div
            className={cn(
              'shrink-0 bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)]',
              compact ? '-mx-[18px] h-[170px] px-[18px] pt-10' : '-mx-5 -mt-6 h-[230px] px-6 pt-14',
            )}
          >
            {dots}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-brand-foreground">
                {welcomePosition(i, n)}
              </span>
              {skip}
            </div>
          </div>
          <div className={cn('flex shrink-0', compact ? '-mt-8' : '-mt-14')}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, sem otimizador.
              <img
                src={avatarUrl}
                alt=""
                className={cn(
                  'object-cover ring-4 ring-background',
                  compact ? 'h-14 w-14 rounded-[18px]' : 'h-[72px] w-[72px] rounded-[24px]',
                )}
              />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'inline-flex items-center justify-center bg-brand font-display font-bold text-brand-foreground ring-4 ring-background',
                  compact
                    ? 'h-14 w-14 rounded-[18px] text-lg'
                    : 'anim-pop h-[72px] w-[72px] rounded-[24px] text-xl',
                )}
              >
                {initialsOf(groupName)}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className={cn('flex shrink-0 flex-col gap-3', compact ? 'pt-10' : 'pt-8')}>
          {dots}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{welcomePosition(i, n)}</span>
            {skip}
          </div>
          <span
            aria-hidden
            className={cn(
              'inline-flex items-center justify-center bg-brand-soft text-brand',
              compact ? 'h-10 w-10 rounded-xl' : 'mt-2 h-14 w-14 rounded-[18px]',
            )}
          >
            <Icon name={PLAIN_ICON[welcomePageIcon(page)]} size={compact ? 18 : 24} />
          </span>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="text-eb uppercase text-brand">{groupName}</span>
        <h1
          className={cn(
            'break-words font-display leading-tight',
            compact ? 'text-[22px] font-bold' : 'text-h1',
          )}
        >
          {page.title}
        </h1>
      </div>

      {lines.length > 0 && (
        <ul className={cn('flex shrink-0 flex-col', compact ? 'gap-1.5' : 'gap-3')}>
          {lines.map((l, k) => (
            <li key={k} className="flex items-start gap-3">
              {l.bullet && (
                <span
                  aria-hidden
                  className={cn(
                    'shrink-0 rounded-[3px] bg-brand',
                    compact ? 'mt-1.5 h-1.5 w-1.5' : 'mt-2 h-2 w-2',
                  )}
                />
              )}
              <span
                className={cn(
                  'min-w-0 break-words',
                  compact
                    ? 'text-[13px] leading-snug text-muted-foreground'
                    : 'text-base leading-normal',
                )}
              >
                {l.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {page.showTeam && team.length > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex">
            {team.slice(0, 3).map((m, k) => (
              <Avatar key={m.name + k} initials={initialsOf(m.name)} tone={AVATAR_TONES[k % 3]} />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {namesLine(team.map((m) => m.name))}
          </span>
        </div>
      )}

      <div aria-hidden className="flex-1" />

      <div className="flex shrink-0 gap-2">
        {canBack && (
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => (i > 0 ? go(i - 1) : onBackFirst?.())}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-[14px] bg-muted text-foreground',
              compact ? 'h-11 w-11' : 'h-14 w-14',
            )}
          >
            <Icon name="chevL" size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={() => (i < n - 1 ? go(i + 1) : onFinish?.())}
          className={cn(
            'flex-1 rounded-[14px] bg-brand font-extrabold text-brand-foreground',
            compact ? 'h-11 text-sm' : 'h-14 text-base',
          )}
        >
          {welcomeCta(i, n)}
        </button>
      </div>
      {note && (
        <p className="shrink-0 text-center text-xs text-muted-foreground">
          {WELCOME_COPY.reviewLater}
        </p>
      )}
    </section>
  );
}
