'use client';

import { useState } from 'react';
import {
  ICON_NAMES,
  THEME_PREFERENCE_LABELS,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@fatia/design';
import { Badge, STATUS_BADGE_LABELS } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Bars, DayStrip, Heatmap, Ring, StatBlock } from '@/components/ui/data-blocks';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { PortionField } from '@/components/ui/portion-field';
import { Ruler } from '@/components/ui/ruler';
import { Checkbox, Chip, Segmented, Switch } from '@/components/ui/selection';
import { Skeleton } from '@/components/ui/skeleton';
import { SwipeRow } from '@/components/ui/swipe-row';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { AiButton } from '@/components/layout/ai-button';
import { ProBlock, ProBlockCompact } from '@/components/billing/pro-block';
import { ShareCard } from '@/components/sharing/share-card';
import { BrandCover } from '@/components/community/brand-cover';
import { BrandColorField } from '@/components/org/brand-color-field';
import { useThemePreference } from '@/lib/theme-preference';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`ds-${title}`} className="space-y-4">
      <h2 id={`ds-${title}`} className="font-display text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const DAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((weekday, i) => ({
  weekday,
  day: 10 + i,
  label: `dia ${10 + i}`,
  done: i < 3,
}));

/** Galeria de revisão: cada componente do DS v2 em uso, com o tema trocável. */
export function DesignSystemGallery() {
  const { preference, setPreference } = useThemePreference();
  const [chip, setChip] = useState(true);
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(false);
  const [qty, setQty] = useState(1.5);
  const [weight, setWeight] = useState(72);
  const [brand, setBrand] = useState('#7C5CFF');
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="space-y-10">
      <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight">
        Design system
      </h1>
      <Segmented<ThemePreference>
        label="Tema"
        value={preference}
        onChange={setPreference}
        options={THEME_PREFERENCES.map((p) => ({ value: p, label: THEME_PREFERENCE_LABELS[p] }))}
      />

      <Section title="Botões">
        <div className="flex flex-wrap gap-2">
          <Button size="lg">Principal</Button>
          <Button size="lg" variant="secondary">
            Secundário
          </Button>
          <Button size="lg" variant="outline">
            Contorno
          </Button>
          <Button size="lg" variant="text">
            Texto
          </Button>
          <Button size="lg" variant="danger">
            Apagar
          </Button>
          <Button size="lg" variant="brand">
            Marca
          </Button>
          <AiButton onClick={() => {}} />
        </div>
      </Section>

      <Section title="Seleção">
        <div className="flex flex-wrap items-center gap-3">
          <Chip selected={chip} onClick={() => setChip(!chip)}>
            Proteína
          </Chip>
          <Switch checked={on} onCheckedChange={setOn} label="Lembretes" />
          <Checkbox checked={check} onCheckedChange={setCheck} label="Feito" />
        </div>
      </Section>

      <Section title="Campos">
        <Input aria-label="Nome" placeholder="Nome" />
        <Input aria-label="Peso" defaultValue="abc" error="Use um número, como 72,5." />
        <PortionField quantity={qty} portionGrams={25} onChange={setQty} label="colher de sopa" />
        <Ruler value={weight} onChange={setWeight} min={30} max={200} unit="kg" label="Peso" />
      </Section>

      <Section title="Selos e faixas">
        <div className="flex flex-wrap gap-2">
          <Badge variant="free">{STATUS_BADGE_LABELS.free}</Badge>
          <Badge variant="trial">{STATUS_BADGE_LABELS.trial(5)}</Badge>
          <Badge variant="pro">{STATUS_BADGE_LABELS.pro}</Badge>
          <Badge variant="lite">{STATUS_BADGE_LABELS.lite}</Badge>
          <Badge variant="done">{STATUS_BADGE_LABELS.done}</Badge>
          <Badge variant="pending">{STATUS_BADGE_LABELS.pending}</Badge>
          <Badge variant="risk">{STATUS_BADGE_LABELS.risk}</Badge>
        </div>
        <Banner tone="warning" title="IA Lite acabando">
          Sobram 2 de 10 hoje.
        </Banner>
      </Section>

      <Section title="Blocos de dado">
        <div className="flex flex-wrap items-center gap-4">
          <Ring value={1240} max={2000} label="kcal restantes" />
          <StatBlock
            value="12"
            unit="dias"
            label="Sequência"
            icon="flame"
            tone="primary"
            className="w-44"
          />
        </div>
        <DayStrip days={DAYS} selected={3} onSelect={() => {}} />
        <Heatmap
          levels={[0, 1, 2, 3, 3, 2, 1, 0, 3, 3, 2, 2, 1, 3]}
          label="12 de 14 dias registrados"
        />
        <Bars
          values={[4, 6, 3, 8, 5, 7, 2]}
          highlight={[3]}
          labels={['S', 'T', 'Q', 'Q2', 'S2', 'S3', 'D']}
        />
      </Section>

      <Section title="Listas">
        <div className="overflow-hidden rounded-card">
          <SwipeRow
            label="Café da manhã"
            actions={[
              { label: 'Editar', onPress: () => {} },
              { label: 'Apagar', tone: 'danger', onPress: () => setConfirm(true) },
            ]}
          >
            <p className="font-semibold">Café da manhã</p>
            <p className="text-[13px] text-muted-foreground">420 kcal</p>
          </SwipeRow>
        </div>
        <ConfirmSheet
          open={confirm}
          onOpenChange={setConfirm}
          title="Apagar o café da manhã?"
          description="Os 3 itens somem do dia."
          onConfirm={() => setConfirm(false)}
        />
      </Section>

      <Section title="Estados">
        <Skeleton className="h-16 w-full" />
        <EmptyState
          dsIcon="apple"
          title="Nada registrado hoje"
          description="Registre a primeira refeição."
        />
        <ErrorState message="Não deu para carregar." onRetry={() => {}} />
      </Section>

      <Section title="PRO">
        <ProBlock
          state={{ kind: 'trial', day: 4, totalDays: 7, daysLeft: 3 }}
          onAction={() => {}}
        />
        <ProBlockCompact
          state={{ kind: 'lite-ending', remaining: 2, limit: 10 }}
          onAction={() => {}}
        />
      </Section>

      <Section title="Comunidade">
        <BrandCover name="Academia Centro" color={brand} subtitle="128 membros" />
        <BrandColorField value={brand} onChange={setBrand} />
      </Section>

      <Section title="Compartilhar">
        <ShareCard
          data={{
            kind: 'streak',
            headline: '12 dias',
            caption: 'Sequência de registro',
            stats: [{ label: 'Refeições', value: '41' }],
          }}
          identity={{ as: 'handle', value: 'ana' }}
        />
      </Section>

      <Section title="Ícones">
        <ul className="grid grid-cols-6 gap-3 sm:grid-cols-10">
          {ICON_NAMES.map((name) => (
            <li
              key={name}
              className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"
            >
              <Icon name={name} size={24} className="text-foreground" />
              {name}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
