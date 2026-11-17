'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  activeRemindersLabel,
  billingApi,
  keepPhotosText,
  newsApi,
  progressApi,
  remindersApi,
  unitPrefsOf,
  unitsSummary,
  usersApi,
  youHeaderLine,
  type MenuItem,
  type MeUser,
  planBadge,
  type PlanTone,
} from '@fatia/api-client';
import { PlanBadge } from '@/components/billing/plan-badge';
import { Badge } from '@/components/ui/badge';
import { PLAN_QUERY_KEY } from '@/components/billing/plan-screen';
import { REMINDERS_KEY } from '@/components/reminders/keys';
import { useNavMenu } from '@/components/layout/use-nav-menu';
import { SignOutButton } from '@/components/profile/sign-out-button';
import { ProfessionalPanelLink } from '@/components/sharing/professional-panel-link';
import { Icon } from '@/components/ui/icon';
import { signInHref } from '@/lib/next-path';
import { BodyLogSheet } from '@/components/progress/body-log-sheet';
import { HeightSheet } from './height-sheet';
import { NEWS_QUERY_KEY } from './news-cache';
import { useExportData } from './use-export-data';
import { UserAvatar } from './user-avatar';
import { YouActionRow, YouLinkRow, YouSection, YouToggleRow } from './you-list';

const BADGE_VARIANT: Record<PlanTone, 'pro' | 'trial' | 'lite' | 'pending' | 'free'> = {
  pro: 'pro',
  trial: 'trial',
  warn: 'lite',
  mute: 'pending',
  free: 'free',
};

/** `70,2` — o peso do cartão, com vírgula. */
function weightText(kg: number | null | undefined): string {
  return kg == null ? '—' : kg.toFixed(1).replace('.', ',');
}

/**
 * A aba Você (prancha Al-V1, #387): cabeçalho com foto e plano, peso e
 * estatura, as seções de `menuSections` e, no fim, sair e apagar a conta. O
 * que cada linha faz vem da `kind` dela; a tela só decide o detalhe à direita.
 */
export function YouScreen() {
  const sections = useNavMenu();
  const qc = useQueryClient();
  const [heightOpen, setHeightOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const today = useQuery({ queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() });
  const plan = useQuery({ queryKey: PLAN_QUERY_KEY, queryFn: () => billingApi.plan() });
  const news = useQuery({ queryKey: NEWS_QUERY_KEY, queryFn: () => newsApi.list() });
  const reminders = useQuery({ queryKey: REMINDERS_KEY, queryFn: () => remindersApi.list() });
  const exportData = useExportData();

  const keepPhotos = useMutation({
    mutationFn: (keep: boolean) => usersApi.updateMe({ keepMealPhotos: keep }),
    onSuccess: (data) => {
      qc.setQueryData(['users', 'me'], data);
      toast(keepPhotosText(data.keepMealPhotos === true).toast);
    },
    onError: () => toast('Não deu para salvar. Tente de novo.'),
  });

  const user: MeUser | undefined = me.data;
  const units = unitPrefsOf(user);
  const showPlan = plan.data?.requiresPlan === true;
  // "Teste · 3 dias" durante o teste grátis (#386).
  const badge = plan.data ? planBadge(plan.data, new Date()) : null;
  const keep = user?.keepMealPhotos === true;
  const unread = news.data?.unreadCount ?? 0;

  const detailOf = (item: MenuItem): React.ReactNode => {
    if (item.key === 'units') return unitsSummary(units);
    if (item.key === 'reminders' && reminders.data) return activeRemindersLabel(reminders.data);
    if (item.key === 'plan' && badge) return badge.label;
    if (item.key === 'news' && unread > 0) {
      return (
        <span
          aria-label={`${unread} não lidas`}
          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
        >
          {unread}
        </span>
      );
    }
    return item.detail;
  };

  const renderItem = (item: MenuItem) => {
    const icon = item.icon as IconName;
    if (item.kind === 'toggle') {
      return (
        <YouToggleRow
          key={item.key}
          icon={icon}
          label={item.label}
          subtitle={keepPhotosText(keep).subtitle}
          on={keep}
          disabled={!user || keepPhotos.isPending}
          onToggle={() => keepPhotos.mutate(!keep)}
        />
      );
    }
    if (item.kind === 'action') {
      if (item.key === 'password') {
        return (
          <YouActionRow
            key={item.key}
            icon={icon}
            label={item.label}
            subtitle="Enviamos um código para o seu e-mail"
            // O "esqueci minha senha" do Logto, que volta para cá no fim.
            onClick={() => window.location.assign(signInHref('/you', 'senha'))}
          />
        );
      }
      return (
        <YouActionRow
          key={item.key}
          icon={icon}
          label={exportData.isPending ? 'Preparando arquivo…' : item.label}
          subtitle={item.detail}
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        />
      );
    }
    if (item.key === 'plan' && !showPlan) return null;
    return (
      <YouLinkRow
        key={item.key}
        href={item.href!}
        icon={icon}
        label={item.label}
        detail={
          item.locked ? (
            <PlanBadge tier="PRO" className="px-1.5 py-0 text-[10px]" />
          ) : (
            detailOf(item)
          )
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-6">
      <header className="flex items-center gap-4">
        <Link
          href="/you/edit"
          aria-label="Editar perfil e foto"
          className="relative shrink-0 rounded-full"
        >
          <UserAvatar name={user?.name} url={user?.avatarUrl} size={72} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-[3px] ring-background">
            <Icon name="camera" size={16} />
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-display text-h2 text-foreground">{user?.name ?? ''}</h1>
          {user && <p className="truncate text-xs text-faint">{youHeaderLine(user)}</p>}
          <div className="flex items-center gap-2">
            {showPlan && badge && (
              <Link href="/plan" aria-label={`Meu plano: ${badge.label}`}>
                <Badge variant={BADGE_VARIANT[badge.tone]}>{badge.label}</Badge>
              </Link>
            )}
            <Link
              href="/you/edit"
              className="-my-3 py-3 text-xs font-bold text-primary hover:underline"
            >
              Editar perfil
            </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {/* Abre o registrar peso (Al-G7), como na prancha Al-V1. */}
        <button
          type="button"
          onClick={() => setWeightOpen(true)}
          className="flex flex-col gap-2 rounded-card bg-card px-[18px] py-4 text-left"
        >
          <span className="text-xs text-faint">Peso atual</span>
          <span className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-foreground">
            {weightText(today.data?.weight.latest?.weightKg)}
            <span className="ms-[3px] text-[10px] font-semibold tracking-normal text-muted-foreground">
              kg
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setHeightOpen(true)}
          className="flex flex-col gap-2 rounded-card bg-card px-[18px] py-4 text-left"
        >
          <span className="flex w-full items-center justify-between text-xs text-faint">
            Estatura
            <Icon name="edit" size={16} className="text-muted-foreground" />
          </span>
          <span className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-foreground">
            {user?.heightCm ? Math.round(user.heightCm) : '—'}
            <span className="ms-[3px] text-[10px] font-semibold tracking-normal text-muted-foreground">
              cm
            </span>
          </span>
        </button>
      </div>

      {sections.map((section) => (
        <YouSection key={section.title} title={section.title}>
          {section.items.map(renderItem)}
          {section.title === 'Comunidade e equipe' && <ProfessionalPanelLink />}
        </YouSection>
      ))}

      <SignOutButton />
      <Link
        href="/you/delete"
        className="self-center px-3 py-1 text-[13px] text-faint underline underline-offset-[3px]"
      >
        Apagar minha conta
      </Link>

      <BodyLogSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
      <HeightSheet
        open={heightOpen}
        onOpenChange={setHeightOpen}
        heightCm={user?.heightCm ?? null}
      />
    </div>
  );
}
