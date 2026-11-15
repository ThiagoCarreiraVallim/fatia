'use client';

import { useState } from 'react';
import {
  duration,
  hexToHslTriplet,
  ICON_NAMES,
  palettes,
  radius,
  spacing,
  stagger,
  THEME_PREFERENCE_LABELS,
  THEME_PREFERENCES,
  TOKEN_NAMES,
  typeScale,
  type Theme,
  type ThemePreference,
  type TypeStep,
} from '@fatia/design';
import { PRIMARY_TABS, type ProBlockState } from '@fatia/api-client';
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
import { AiGenerate } from '@/components/ui/ai-generate';
import { PersonalNotice } from '@/components/ui/personal-notice';
import { ShareSheet } from '@/components/sharing/share-sheet';
import { WaterCard } from '@/components/dashboard/water-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

function Section({
  title,
  wide = false,
  children,
}: {
  title: string;
  /** Ocupa as duas colunas no desktop. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  // `aria-labelledby` é lista de ids separada por espaço: id com espaço não nomeia.
  const id = `ds-${title
    .normalize('NFD')
    .replace(/[^\w]+/g, '-')
    .toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={cn('min-w-0 space-y-4', wide && 'md:col-span-2')}>
      <h2 id={id} className="font-display text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Pinta um pedaço da página num tema fixo, trocando as variáveis do DS no
 * `style`: a galeria mostra a barra escura e a clara lado a lado, sem depender
 * do tema da página.
 */
function ThemeScope({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const vars = Object.fromEntries(
    TOKEN_NAMES.map((name) => [`--${name}`, hexToHslTriplet(palettes[theme][name])]),
  ) as React.CSSProperties;
  return (
    <div style={vars} className="rounded-card bg-background p-3 text-foreground">
      {children}
    </div>
  );
}

/** A barra de 5 abas + botão da IA (prancha Main), sem rota nem dado: só o desenho. */
function NavBarPreview() {
  return (
    <div className="flex items-center gap-3">
      <nav
        aria-label="Barra de abas (exemplo)"
        className="flex h-[68px] flex-1 items-center gap-1 rounded-[26px] bg-card p-2"
      >
        {PRIMARY_TABS.map((tab, i) => (
          <span
            key={tab.key}
            aria-current={i === 0 ? 'page' : undefined}
            className={cn(
              'flex h-[52px] flex-1 items-center justify-center rounded-2xl',
              i === 0 ? 'bg-foreground text-background' : 'text-faint',
            )}
          >
            {tab.icon === 'avatar' ? (
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold text-foreground">
                A
              </span>
            ) : (
              <Icon name={tab.icon} size={22} />
            )}
            <span className="sr-only">{tab.label}</span>
          </span>
        ))}
      </nav>
      <span
        aria-hidden
        className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Icon name="spark" size={26} />
      </span>
    </div>
  );
}

const PRO_STATES: { label: string; state: ProBlockState; canPurchase?: boolean }[] = [
  { label: 'Free', state: { kind: 'free', trialDays: 7 } },
  { label: 'Teste', state: { kind: 'trial', day: 4, totalDays: 7, daysLeft: 3 } },
  { label: 'PRO', state: { kind: 'pro', interval: 'YEARLY', renewsAt: '2026-12-04T00:00:00Z' } },
  { label: 'PRO · Academia', state: { kind: 'pro-community', groupName: 'Academia Demo' } },
  { label: 'PRO até', state: { kind: 'pro-until', until: '2026-11-30T00:00:00Z', daysLeft: 6 } },
  { label: 'Lite acabando', state: { kind: 'lite-ending', remaining: 3, limit: 30 } },
  { label: 'Sem compra (iOS)', state: { kind: 'free-no-purchase' }, canPurchase: false },
  {
    label: 'Pagamento pendente',
    state: { kind: 'pending-grace', aiUntil: '2026-11-11T00:00:00Z', graceDaysLeft: 5 },
  },
  { label: 'PRO venceu', state: { kind: 'pro-expired' } },
];

const COLOR_GROUPS: { title: string; names: (typeof TOKEN_NAMES)[number][] }[] = [
  {
    title: 'Superfícies e texto',
    names: [
      'background',
      'muted',
      'card',
      'surface-3',
      'border',
      'foreground',
      'muted-foreground',
      'faint-foreground',
    ],
  },
  {
    title: 'Marca e estado',
    names: ['primary', 'primary-text', 'danger', 'warning', 'success', 'info'],
  },
  { title: 'Dados', names: ['kcal', 'protein', 'carbs', 'fat', 'water', 'steps'] },
];

/** As 8 animações da prancha Movimento, cada uma com o próprio "Repetir". */
function MotionDemo({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: (key: number) => React.ReactNode;
}) {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4">
      <div className="flex min-h-[96px] items-center justify-center overflow-hidden">
        {children(run)}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-[13px] text-muted-foreground">{detail}</p>
        </div>
        <Button size="xs" variant="secondary" onClick={() => setRun((n) => n + 1)}>
          <Icon name="repeat" size={14} />
          Repetir
        </Button>
      </div>
    </div>
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
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [groups, setGroups] = useState<string[]>(['Peito']);
  const [share, setShare] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'generating' | 'draft'>('idle');

  const generate = () => {
    setAiState('generating');
    setTimeout(() => setAiState('draft'), 1800);
  };

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight">
          Design system
        </h1>
        <Segmented<ThemePreference>
          label="Tema"
          value={preference}
          onChange={setPreference}
          options={THEME_PREFERENCES.map((p) => ({ value: p, label: THEME_PREFERENCE_LABELS[p] }))}
        />
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Cores" wide>
          <div className="grid gap-6 md:grid-cols-3">
            {COLOR_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <h3 className="text-[13px] font-bold text-muted-foreground">{group.title}</h3>
                <ul className="grid grid-cols-2 gap-2">
                  {group.names.map((name) => (
                    <li key={name} className="flex items-center gap-2 text-[12px]">
                      <span
                        aria-hidden
                        className="h-8 w-8 shrink-0 rounded-chip border border-border"
                        style={{ background: `hsl(var(--${name}))` }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{name}</span>
                        <span className="block text-muted-foreground">
                          {palettes.dark[name].toUpperCase()} · {palettes.light[name].toUpperCase()}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tipografia">
          <ul className="space-y-3">
            {(Object.keys(typeScale) as TypeStep[]).map((step) => {
              const t = typeScale[step];
              return (
                <li key={step} className="flex items-baseline gap-3">
                  <span className="w-8 shrink-0 text-[12px] text-muted-foreground">{step}</span>
                  <span
                    className={cn(
                      'min-w-0 truncate',
                      t.family === 'display' ? 'font-display' : 'font-sans',
                    )}
                    style={{
                      fontSize: t.size,
                      fontWeight: t.weight,
                      lineHeight: t.lineHeight,
                      letterSpacing: `${t.tracking}em`,
                    }}
                  >
                    {t.family === 'display' ? '1.240' : 'Manrope no texto'}
                  </span>
                  <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
                    {t.family === 'display' ? 'Sora' : 'Manrope'} {t.size}/{t.weight}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Espaço e raios">
          <ul className="flex flex-wrap items-end gap-3">
            {spacing.scale.map((px) => (
              <li
                key={px}
                className="flex flex-col items-center gap-1 text-[12px] text-muted-foreground"
              >
                <span aria-hidden className="block bg-primary" style={{ width: px, height: px }} />
                {px}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted-foreground">
            Margem da tela {spacing.screenMargin} · entre blocos {spacing.blockGap.join('–')} · alvo
            de toque {spacing.minTarget}
          </p>
          <ul className="flex flex-wrap gap-3">
            {(Object.entries(radius) as [string, number][]).map(([name, r]) => (
              <li
                key={name}
                className="flex flex-col items-center gap-1 text-[12px] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="block h-14 w-14 border-2 border-primary bg-card"
                  style={{ borderRadius: Math.min(r, 28) }}
                />
                {name} {r === 999 ? 'pílula' : r}
              </li>
            ))}
          </ul>
        </Section>

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
            <Button size="lg" disabled>
              Desativado
            </Button>
            <AiButton onClick={() => {}} />
          </div>
        </Section>

        <Section title="Seleção">
          <Tabs defaultValue="mural">
            <TabsList>
              <TabsTrigger value="mural">Mural</TabsTrigger>
              <TabsTrigger value="desafios">Desafios</TabsTrigger>
              <TabsTrigger value="planos">Planos</TabsTrigger>
            </TabsList>
            <TabsContent value="mural" className="text-[13px] text-muted-foreground">
              Avisos e posts da comunidade.
            </TabsContent>
            <TabsContent value="desafios" className="text-[13px] text-muted-foreground">
              Desafios abertos.
            </TabsContent>
            <TabsContent value="planos" className="text-[13px] text-muted-foreground">
              Planos da equipe.
            </TabsContent>
          </Tabs>
          <Segmented
            label="Período"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'day', label: 'Dia' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mês' },
            ]}
          />
          <Segmented
            label="Unidade de peso"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
          <div role="group" aria-label="Grupos musculares" className="flex flex-wrap gap-2">
            {['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Core'].map((g) => (
              <Chip
                key={g}
                selected={groups.includes(g)}
                onClick={() =>
                  setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))
                }
              >
                {g}
              </Chip>
            ))}
          </div>
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
            <Badge variant="pro-community">PRO · Academia</Badge>
            <Badge variant="lite">{STATUS_BADGE_LABELS.lite}</Badge>
            <Badge variant="done">{STATUS_BADGE_LABELS.done}</Badge>
            <Badge variant="pending">{STATUS_BADGE_LABELS.pending}</Badge>
            <Badge variant="risk">{STATUS_BADGE_LABELS.risk}</Badge>
          </div>
          <Banner tone="warning" title="IA Lite acabando">
            Sobram 2 de 10 hoje.
          </Banner>
          <PersonalNotice
            notice={{
              kind: 'workout',
              planName: 'Hipertrofia A/B',
              from: 'Helena Prado',
              when: 'agora',
            }}
            onAction={() => {}}
          />
          <PersonalNotice
            notice={{ kind: 'nutrition-plan', kcal: 1800, from: 'Helena Prado', when: '2 h' }}
            onAction={() => {}}
          />
          <PersonalNotice notice={{ kind: 'assessment', due: 'sexta' }} onAction={() => {}} />
          <PersonalNotice
            notice={{ kind: 'checkin', questions: 5, minutes: 1 }}
            onAction={() => {}}
          />
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
          <div className="rounded-card bg-card p-4">
            <p className="mb-3 text-[13px] font-bold text-muted-foreground">Treinos · semana</p>
            <Bars
              values={[1, 0, 1, 1, 0, 1, 0]}
              highlight={[5]}
              labels={['S', 'T', 'Q', 'Q2', 'S2', 'S3', 'D']}
            />
          </div>
          <WaterCard data={{ todayMl: 1250, targetMl: 2500, goalReached: false, logged: true }} />
        </Section>

        <Section title="Listas">
          <ul className="overflow-hidden rounded-card bg-card">
            {[
              { i: 'AD', name: 'Ana Demo', role: 'Perfil', badge: 'trial' as const, text: 'Teste' },
              {
                i: 'CS',
                name: 'Carla Souza',
                role: 'Membro',
                badge: 'pro-community' as const,
                text: 'PRO · AD',
              },
              { i: 'DL', name: 'Diego Lima', role: 'Membro', badge: 'lite' as const, text: 'Lite' },
            ].map((p) => (
              <li
                key={p.name}
                className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2 last:border-0"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-[12px] font-bold"
                >
                  {p.i}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block text-[13px] text-muted-foreground">{p.role}</span>
                </span>
                <Badge variant={p.badge}>{p.text}</Badge>
              </li>
            ))}
          </ul>
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

        <Section title="Navegação" wide>
          <div className="grid gap-4 md:grid-cols-2">
            <ThemeScope theme="dark">
              <NavBarPreview />
            </ThemeScope>
            <ThemeScope theme="light">
              <NavBarPreview />
            </ThemeScope>
          </div>
        </Section>

        <Section title="Retorno e folha">
          <div
            role="status"
            className="flex items-center gap-3 rounded-field bg-foreground px-4 py-3 text-sm font-bold text-background"
          >
            <Icon name="check" size={18} />
            <span className="flex-1">Série 3 salva</span>
            <span className="underline">Desfazer</span>
          </div>
          <div className="rounded-t-sheet bg-muted px-5 pb-6 pt-3">
            <div aria-hidden className="mx-auto mb-4 h-1 w-12 rounded-full bg-border-strong" />
            <p className="font-display text-h2">Folha inferior</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Sobe em 550 ms; o fundo escurece em 300 ms.
            </p>
            <Button size="lg" full className="mt-4">
              Ok
            </Button>
          </div>
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

        <Section title="PRO" wide>
          <ul className="grid gap-4 md:grid-cols-3">
            {PRO_STATES.map((p) => (
              <li key={p.label} className="space-y-1">
                <p className="text-[12px] font-bold text-muted-foreground">{p.label}</p>
                <ProBlock state={p.state} canPurchase={p.canPurchase} onAction={() => {}} />
              </li>
            ))}
          </ul>
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
          <Button variant="secondary" onClick={() => setShare(true)}>
            <Icon name="share" size={16} />
            Abrir a folha Compartilhar
          </Button>
          <ShareSheet
            open={share}
            onOpenChange={setShare}
            data={{ kind: 'streak', headline: '12 dias', caption: 'Sequência de registro' }}
            person={{ name: 'Ana', handle: 'anademo' }}
            onShare={() => setShare(false)}
          />
        </Section>

        <Section title="Gerar com IA">
          <AiGenerate title="Novo plano de treino" state={aiState} onGenerate={generate}>
            {aiState === 'draft' ? (
              <ul className="space-y-1 text-sm">
                <li>Treino A · Glúteo e posterior · 45 min</li>
                <li>Treino B · Quadríceps e core · 45 min</li>
                <li>Treino C · Corpo todo em máquinas · 40 min</li>
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Descreva o plano e a IA monta um rascunho.
              </p>
            )}
          </AiGenerate>
        </Section>

        <Section title="Movimento" wide>
          <div className="grid gap-4 md:grid-cols-2">
            <MotionDemo
              title="Anel + contagem"
              detail={`${duration.data / 1000} s · número sobe junto`.replace('.', ',')}
            >
              {(k) => <Ring key={k} value={1240} max={2000} size={88} stroke={8} label="kcal" />}
            </MotionDemo>
            <MotionDemo title="Barras crescem" detail={`${stagger.bars} ms entre barras`}>
              {(k) => (
                <Bars
                  key={k}
                  values={[3, 5, 2, 6, 4]}
                  labels={['a', 'b', 'c', 'd', 'e']}
                  className="h-[80px] w-40"
                />
              )}
            </MotionDemo>
            <MotionDemo title="Lista em cascata" detail={`sobe 14 px + fade · ${stagger.list} ms`}>
              {(k) => (
                <ul key={k} className="w-40 space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <li
                      key={i}
                      className="anim-up h-5 rounded-chip bg-surface-3"
                      style={{ '--i': i } as React.CSSProperties}
                    />
                  ))}
                </ul>
              )}
            </MotionDemo>
            <MotionDemo
              title="Folha sobe"
              detail={`${duration.sheet} ms · fundo em ${duration.base} ms`}
            >
              {(k) => <div key={k} className="anim-up h-16 w-40 rounded-t-sheet bg-muted" />}
            </MotionDemo>
            <MotionDemo title="Check e conquista" detail="mola · .35–.5 s">
              {(k) => (
                <div key={k} className="flex gap-4">
                  <span className="anim-pop flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon name="check" size={22} />
                  </span>
                  <span className="anim-pop flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--warning)/0.2)] text-warning">
                    <Icon name="medal" size={22} />
                  </span>
                </div>
              )}
            </MotionDemo>
            <MotionDemo
              title="Toast"
              detail={`cai do topo · some em ${duration.toast / 1000} s`.replace('.', ',')}
            >
              {(k) => (
                <div
                  key={k}
                  className="anim-toast flex items-center gap-2 rounded-field bg-foreground px-3 py-2 text-[13px] font-bold text-background"
                >
                  <Icon name="check" size={14} />
                  Série 3 salva
                </div>
              )}
            </MotionDemo>
            <MotionDemo title="Respiração e pulso" detail="só em estado ativo">
              {(k) => (
                <div key={k} className="flex items-center gap-4">
                  <span className="anim-breathe flex h-10 items-center rounded-full bg-primary px-4 text-[13px] font-bold text-primary-foreground">
                    Treino rodando
                  </span>
                  <span className="anim-pulse-dot h-3 w-3 rounded-full bg-danger" />
                </div>
              )}
            </MotionDemo>
            <MotionDemo
              title="Indicador de aba"
              detail={`linha cresce da esquerda · ${duration.tab} ms`}
            >
              {(k) => (
                <div key={k} className="w-40">
                  <div className="flex justify-between text-[13px] font-bold">
                    <span>Mural</span>
                    <span className="text-muted-foreground">Desafios</span>
                  </div>
                  <div className="anim-tab mt-1 h-[3px] w-14 rounded-full bg-foreground" />
                </div>
              )}
            </MotionDemo>
          </div>
        </Section>

        <Section title="Ícones" wide>
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
    </div>
  );
}
