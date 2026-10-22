import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Pin, Salad } from 'lucide-react-native';
import {
  contentApi,
  markdownLitePlainText,
  TIP_CATEGORY_LABEL,
  type MyGroup,
} from '@fatia/api-client';
import { TemplateCard } from '@/components/content/content-cards';
import {
  DrawerOption,
  NewButton,
  RowChevron,
  SectionHeader,
  StatusBadge,
} from '@/components/content/content-ui';
import { OrgPanel, orgKeys } from '@/components/org/org-panel';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { cores } from '@/theme/cores';

type Tab = 'plans' | 'tips';

/**
 * As duas listas. "Planos | Dicas" é um `Tabs` de verdade (segmentado), e não
 * mais o `Choice` em pílulas: o `Choice` tem a mesma cara das seções do painel
 * logo acima, que trocam de tela — duas fileiras iguais com trabalhos
 * diferentes. Criar saiu das abas e virou um "Novo …" no cabeçalho de cada lista.
 */
function ContentLists({
  g,
  tab,
  onTabChange,
  onNewPlan,
}: {
  g: MyGroup;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onNewPlan: () => void;
}) {
  const router = useRouter();
  const plans = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });
  const tips = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
  });
  const base = `/org/${g.id}/content`;
  const newTip = () => router.push(`${base}/tips/new`);

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        {`O que a equipe publica aqui aparece para os membros de ${g.name}. Quem adota recebe uma cópia: mudar o original não mexe nela.`}
      </Text>
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as Tab)}>
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="tips">Dicas</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 gap-3">
          <SectionHeader
            title="Planos"
            count={plans.data?.length}
            action={<NewButton label="Novo plano" onPress={onNewPlan} />}
          />
          {plans.isPending ? (
            <LoadingState label="Carregando os planos…" />
          ) : plans.isError ? (
            // Antes o erro caía no estado vazio e dizia "Nenhum plano ainda" —
            // mentira que leva a criar de novo o que já existe.
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : plans.data.length ? (
            plans.data.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                showStatus
                onPress={() => router.push(`${base}/plans/${t.id}`)}
              />
            ))
          ) : (
            <EmptyState
              title="Nenhum plano ainda"
              description="Publique um treino seu ou metas e refeições para os membros adotarem."
              action={<NewButton label="Novo plano" onPress={onNewPlan} />}
            />
          )}
        </TabsContent>

        <TabsContent value="tips" className="mt-4 gap-3">
          <SectionHeader
            title="Dicas"
            count={tips.data?.length}
            action={<NewButton label="Nova dica" onPress={newTip} />}
          />
          {tips.isPending ? (
            <LoadingState label="Carregando as dicas…" />
          ) : tips.isError ? (
            <ErrorState error={tips.error} onRetry={() => void tips.refetch()} />
          ) : tips.data.length ? (
            tips.data.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="link"
                accessibilityLabel={[
                  d.title,
                  TIP_CATEGORY_LABEL[d.category],
                  d.publishedAt ? 'publicada' : 'rascunho',
                  d.pinned ? 'fixada no topo' : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() => router.push(`${base}/tips/${d.id}`)}
                className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
              >
                <View className="flex-1 gap-1">
                  <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                    {d.title}
                  </Text>
                  <Text numberOfLines={2} className="text-xs text-muted-foreground">
                    {`${TIP_CATEGORY_LABEL[d.category]} · ${markdownLitePlainText(d.body)}`}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <StatusBadge published={Boolean(d.publishedAt)} feminine />
                    {/* O alfinete sozinho não dizia nada; com a palavra, diz. */}
                    {d.pinned ? (
                      <View className="flex-row items-center gap-1">
                        <Pin size={12} color={cores.primary} />
                        <Text className="text-xs font-medium text-primary">Fixada</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <RowChevron />
              </Pressable>
            ))
          ) : (
            <EmptyState
              title="Nenhuma dica ainda"
              description="Dicas curtas de treino, alimentação ou hábitos, com imagem se quiser."
              action={<NewButton label="Nova dica" onPress={newTip} />}
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * "Que tipo de plano?" — os dois botões de antes ("Plano de treino" cheio e
 * "Plano de nutrição" de contorno) não diziam que criavam nada e, lado a lado
 * com pesos diferentes, pareciam um seletor com o treino já escolhido.
 */
function NewPlanDrawer({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: 'WORKOUT' | 'NUTRITION') => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo plano</DrawerTitle>
          <DrawerDescription>
            Começa como rascunho; só os membros veem depois de publicar.
          </DrawerDescription>
        </DrawerHeader>
        <View className="gap-2 px-4 pt-2">
          <DrawerOption
            icon={Dumbbell}
            title="Plano de treino"
            description="A partir de um dos seus planos de treino."
            onPress={() => onPick('WORKOUT')}
          />
          <DrawerOption
            icon={Salad}
            title="Plano de nutrição"
            description="Metas de calorias e macros e refeições salvas."
            onPress={() => onPick('NUTRITION')}
          />
        </View>
      </DrawerContent>
    </Drawer>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/content/page.tsx`. */
export default function OrgContentScreen() {
  const { groupId, tab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  // `?tab=tips` volta para a aba certa quando a tela é recriada (apagar uma dica
  // aberta por link direto, sem tela anterior na pilha).
  const [activeTab, setActiveTab] = useState<Tab>(tab === 'tips' ? 'tips' : 'plans');
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  return (
    <OrgPanel
      groupId={groupId}
      drawers={(g) => (
        <NewPlanDrawer
          open={newPlanOpen}
          onOpenChange={setNewPlanOpen}
          onPick={(kind) => {
            setNewPlanOpen(false);
            router.push(`/org/${g.id}/content/plans/new?kind=${kind}`);
          }}
        />
      )}
    >
      {(g) => (
        <ContentLists
          g={g}
          tab={activeTab}
          onTabChange={setActiveTab}
          onNewPlan={() => setNewPlanOpen(true)}
        />
      )}
    </OrgPanel>
  );
}
