import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ProBlockState } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import {
  Bars,
  Checkbox,
  DayStrip,
  Heatmap,
  Ring,
  StatBlock,
  type Day,
} from '@/components/ui/data-blocks';
import { Chip, Segmented, Switch } from '@/components/ui/selection';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { colors } from '@/theme/colors';
import { DrawerLayer } from '@/components/ui/drawer';
import { Badge, STATUS_BADGE_LABELS } from '@/components/ui/badge';
import { PortionField } from '@/components/ui/portion-field';
import { Ruler } from '@/components/ui/ruler';
import { SwipeRow } from '@/components/ui/swipe-row';
import { PersonalNotice } from '@/components/ui/personal-notice';
import { AiGenerate } from '@/components/ui/ai-generate';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { ProBlock, ProBlockCompact } from '@/components/billing/pro-block';
import { BrandCover } from '@/components/community/brand-cover';
import { ShareCard } from '@/components/sharing/share-card';
import { ShareSheet } from '@/components/sharing/share-sheet';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
        {title}
      </Text>
      {children}
    </View>
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

const DAYS: Day[] = [
  { weekday: 'S', day: 2, label: 'segunda, 2 de novembro', done: true },
  { weekday: 'T', day: 3, label: 'terça, 3 de novembro', done: true },
  { weekday: 'Q', day: 4, label: 'quarta, 4 de novembro', done: true },
  { weekday: 'Q', day: 5, label: 'quinta, 5 de novembro' },
  { weekday: 'S', day: 6, label: 'sexta, 6 de novembro' },
  { weekday: 'S', day: 7, label: 'sábado, 7 de novembro' },
  { weekday: 'D', day: 8, label: 'domingo, 8 de novembro' },
];

const MUSCLE_GROUPS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Core'];

/**
 * Galeria do DS v2 no app (#368): os componentes das pranchas Componentes e
 * Componentes-plano, para conferir no aparelho nos dois temas. Mesmas seções
 * da `/design-system` da web (o teste `data-blocks.test.ts` confere).
 */
export default function DesignSystemScreen() {
  const toast = useToast();
  const [qty, setQty] = useState(1.5);
  const [weight, setWeight] = useState(72);
  const [share, setShare] = useState(false);
  const [ai, setAi] = useState<'idle' | 'generating' | 'draft'>('idle');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [groups, setGroups] = useState<string[]>(['Pernas']);
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(false);
  const [day, setDay] = useState(3);

  return (
    <>
      <Screen>
        <View className="gap-8 px-5 pb-10">
          <Section title="Botões">
            <Button size="xl">Salvar</Button>
            <View className="flex-row flex-wrap gap-2">
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="text">Texto</Button>
              <Button variant="danger">
                <Icon name="trash" size={16} color={colors.danger} />
                <Text className="font-sans-semibold text-sm text-danger">Apagar</Text>
              </Button>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <Button variant="add">Adicionar</Button>
              <Button variant="secondary" size="sm">
                Pequeno
              </Button>
              <Button variant="secondary" size="xs">
                Mini
              </Button>
              <Button disabled>Desativado</Button>
              <Button variant="ai">Gerar com IA</Button>
              <Button variant="brand">Marca</Button>
            </View>
          </Section>

          <Section title="Seleção">
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
            <View accessibilityLabel="Grupos musculares" className="flex-row flex-wrap gap-2">
              {MUSCLE_GROUPS.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  selected={groups.includes(g)}
                  onPress={() =>
                    setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))
                  }
                />
              ))}
            </View>
            <View className="flex-row items-center gap-4">
              <Switch checked={on} onCheckedChange={setOn} label="Lembretes" />
              <Checkbox checked={check} onCheckedChange={setCheck} label="Feito" />
            </View>
          </Section>

          <Section title="Campos">
            <PortionField
              quantity={qty}
              portionGrams={25}
              onChange={setQty}
              label="colher de sopa"
            />
            <Ruler value={weight} onChange={setWeight} min={30} max={200} unit="kg" label="Peso" />
          </Section>

          <Section title="Blocos de dado">
            <View className="flex-row flex-wrap items-center gap-4">
              <Ring value={1240} max={2000} label="kcal restantes" />
              <StatBlock
                value="12"
                unit="dias"
                label="Sequência"
                icon="flame"
                tone="primary"
                className="w-44"
              />
            </View>
            <DayStrip days={DAYS} selected={day} onSelect={setDay} />
            <Heatmap
              levels={[0, 1, 2, 3, 3, 2, 1, 0, 3, 3, 2, 2, 1, 3]}
              label="12 de 14 dias registrados"
            />
            <View className="rounded-card bg-card p-4">
              <Text className="mb-3 font-sans-bold text-[13px] text-muted-foreground">
                Treinos · semana
              </Text>
              <Bars
                values={[1, 0, 1, 1, 0, 1, 0]}
                highlight={[5]}
                labels={['S', 'T', 'Q', 'Q2', 'S2', 'S3', 'D']}
              />
            </View>
          </Section>

          <Section title="Retorno">
            <View
              accessibilityRole="alert"
              className="flex-row items-center gap-3 rounded-field bg-foreground px-4 py-3"
            >
              <Icon name="check" size={18} color={colors.background} />
              <Text className="flex-1 font-sans-bold text-sm text-background">Série 3 salva</Text>
              <Text className="font-sans-bold text-sm text-background underline">Desfazer</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="secondary"
                onPress={() => toast.show({ message: 'Água registrada' })}
              >
                Toast
              </Button>
              <Button
                variant="secondary"
                onPress={() =>
                  toast.show({
                    message: 'Almoço apagado',
                    action: { label: 'Desfazer', onPress: () => {} },
                  })
                }
              >
                Toast com Desfazer
              </Button>
            </View>
          </Section>

          <Section title="Estados">
            <LoadingState />
            <EmptyState
              title="Nada registrado hoje"
              description="Toque no botão da IA para registrar."
            />
            <ErrorState error={new Error('Não deu para carregar.')} onRetry={() => {}} />
          </Section>

          <Section title="Selos">
            <View className="flex-row flex-wrap gap-2">
              <Badge variant="free">{STATUS_BADGE_LABELS.free}</Badge>
              <Badge variant="trial">{STATUS_BADGE_LABELS.trial(5)}</Badge>
              <Badge variant="pro">{STATUS_BADGE_LABELS.pro}</Badge>
              <Badge variant="pro-community">
                {STATUS_BADGE_LABELS['pro-community']('Academia')}
              </Badge>
              <Badge variant="lite">{STATUS_BADGE_LABELS.lite}</Badge>
              <Badge variant="done">{STATUS_BADGE_LABELS.done}</Badge>
              <Badge variant="pending">{STATUS_BADGE_LABELS.pending}</Badge>
              <Badge variant="risk">{STATUS_BADGE_LABELS.risk}</Badge>
            </View>
          </Section>

          <Section title="Lista com swipe">
            <View className="overflow-hidden rounded-card">
              <SwipeRow
                label="Café da manhã"
                actions={[
                  { label: 'Editar', onPress: () => toast.show({ message: 'Editar' }) },
                  {
                    label: 'Apagar',
                    tone: 'danger',
                    onPress: () =>
                      toast.show({
                        message: 'Apagado',
                        action: { label: 'Desfazer', onPress: () => {} },
                      }),
                  },
                ]}
              >
                <Text className="font-sans-semibold text-foreground">Café da manhã</Text>
                <Text className="text-b2 text-muted-foreground">420 kcal</Text>
              </SwipeRow>
            </View>
          </Section>

          <Section title="Aviso do personal">
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

          <Section title="PRO">
            {PRO_STATES.map((p) => (
              <View key={p.label} className="gap-1">
                <Text className="font-sans-bold text-xs text-muted-foreground">{p.label}</Text>
                <ProBlock state={p.state} canPurchase={p.canPurchase} onAction={() => {}} />
              </View>
            ))}
            <ProBlockCompact
              state={{ kind: 'lite-ending', remaining: 2, limit: 10 }}
              onAction={() => {}}
            />
          </Section>

          <Section title="Comunidade">
            <BrandCover name="Academia Centro" color="#FF7A1A" subtitle="128 membros" />
          </Section>

          <Section title="Compartilhar">
            <ShareCard
              data={{ kind: 'streak', headline: '12 dias', caption: 'Sequência de registro' }}
              identity={{ as: 'handle', value: 'ana' }}
            />
            <Button variant="secondary" onPress={() => setShare(true)}>
              Abrir a folha Compartilhar
            </Button>
          </Section>

          <Section title="Gerar com IA">
            <AiGenerate
              title="Novo plano de treino"
              state={ai}
              onGenerate={() => {
                setAi('generating');
                setTimeout(() => setAi('draft'), 1800);
              }}
            >
              <Text className="text-b2 text-muted-foreground">
                {ai === 'draft'
                  ? 'Treino A · Glúteo e posterior · 45 min'
                  : 'Descreva o plano e a IA monta um rascunho.'}
              </Text>
            </AiGenerate>
          </Section>
        </View>
      </Screen>
      <DrawerLayer>
        <ShareSheet
          open={share}
          onOpenChange={setShare}
          data={{ kind: 'streak', headline: '12 dias', caption: 'Sequência de registro' }}
          person={{ name: 'Ana', handle: 'anademo' }}
          onShare={() => setShare(false)}
        />
      </DrawerLayer>
    </>
  );
}
