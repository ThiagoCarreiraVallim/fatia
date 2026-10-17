import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pin } from 'lucide-react-native';
import {
  contentApi,
  contentStatusLabel,
  markdownLitePlainText,
  TIP_CATEGORY_LABEL,
  type MyGroup,
} from '@fatia/api-client';
import { TemplateCard } from '@/components/content/content-cards';
import { Choice, OrgPanel, orgKeys } from '@/components/org/org-panel';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { cores } from '@/theme/cores';

type Aba = 'plans' | 'tips';

function Conteudo({ g }: { g: MyGroup }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('plans');
  const planos = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });
  const dicas = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
  });
  const base = `/org/${g.id}/content`;

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        {`O que a equipe publica aqui aparece para os membros de ${g.name}. Quem adota recebe uma cópia: mudar o original não mexe nela.`}
      </Text>
      <Choice
        label=""
        options={[
          { value: 'plans', label: 'Planos' },
          { value: 'tips', label: 'Dicas' },
        ]}
        value={aba}
        onChange={setAba}
      />

      {aba === 'plans' ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" onPress={() => router.push(`${base}/plans/new?kind=WORKOUT`)}>
              Plano de treino
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => router.push(`${base}/plans/new?kind=NUTRITION`)}
            >
              Plano de nutrição
            </Button>
          </View>
          {planos.isPending ? (
            <LoadingState label="Carregando os planos…" />
          ) : planos.data?.length ? (
            planos.data.map((t) => (
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
            />
          )}
        </View>
      ) : (
        <View className="gap-3">
          <Button size="sm" className="self-start" onPress={() => router.push(`${base}/tips/new`)}>
            Nova dica
          </Button>
          {dicas.isPending ? (
            <LoadingState label="Carregando as dicas…" />
          ) : dicas.data?.length ? (
            dicas.data.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="link"
                accessibilityLabel={d.title}
                onPress={() => router.push(`${base}/tips/${d.id}`)}
                className="gap-1 rounded-2xl border border-border bg-card p-3 active:opacity-80"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1 flex-row items-center gap-1.5">
                    {d.pinned ? <Pin size={14} color={cores.primary} /> : null}
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-sm font-semibold text-foreground"
                    >
                      {d.title}
                    </Text>
                  </View>
                  <Text className="text-xs text-muted-foreground">{contentStatusLabel(d)}</Text>
                </View>
                <Text numberOfLines={2} className="text-xs text-muted-foreground">
                  {`${TIP_CATEGORY_LABEL[d.category]} · ${markdownLitePlainText(d.body)}`}
                </Text>
              </Pressable>
            ))
          ) : (
            <EmptyState
              title="Nenhuma dica ainda"
              description="Dicas curtas de treino, alimentação ou hábitos, com imagem se quiser."
            />
          )}
        </View>
      )}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/content/page.tsx`. */
export default function OrgContentScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Conteudo g={g} />}</OrgPanel>;
}
