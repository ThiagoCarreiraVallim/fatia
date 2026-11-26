import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SETUP_FIRST_ITEMS,
  SETUP_ITEM_COPY,
  setupApi,
  setupItemAction,
  setupPercent,
  type CommunitySetup,
  type ManualSetupStep,
  type MyGroup,
  type SetupItemKey,
  type SetupItemState,
} from '@fatia/api-client';
import { Button, Icon, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { orgKeys } from './org-panel';

/** As duas barras do topo de criar: passo 1 (tipo e nome) e passo 2 (marca). */
export function CreateSteps({ step }: { step: 1 | 2 }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Passo ${step} de 2`}
      className="flex-row gap-1.5"
    >
      {[1, 2].map((n) => (
        <View
          key={n}
          className={cn(
            'h-1 flex-1 rounded-full',
            n < step ? 'bg-primary' : n === step ? 'bg-foreground' : 'bg-muted',
          )}
        />
      ))}
    </View>
  );
}

const setupKey = (groupId: string) => [...orgKeys.all(groupId), 'setup'] as const;

/** O guia de primeiros passos; só a dona da comunidade de verdade pergunta. */
export function useSetup(g: Pick<MyGroup, 'id' | 'role' | 'isDemo'>) {
  return useQuery({
    queryKey: setupKey(g.id),
    queryFn: () => setupApi.get(g.id),
    enabled: g.role === 'OWNER' && !g.isDemo,
  });
}

/** Marcar, desmarcar e o guia (esconder, repetir), com o painel em dia. */
export function useSetupActions(groupId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = (s: CommunitySetup) => qc.setQueryData(setupKey(groupId), s);
  const step = useMutation({
    mutationFn: ({ key, on }: { key: ManualSetupStep; on: boolean }) =>
      setupApi.setStep(groupId, key, on),
    onSuccess: done,
    onError: () => toast.show({ message: 'Não deu para marcar agora. Tente de novo.' }),
  });
  const guide = useMutation({
    mutationFn: (visible: boolean) => setupApi.setGuide(groupId, visible),
    onSuccess: done,
    onError: () => toast.show({ message: 'Não deu para mudar o guia agora. Tente de novo.' }),
  });
  return { step, guide };
}

/**
 * Para onde o "Abrir" do item leva no app. Os que só existem na web (equipe,
 * plano, entrada) ficam sem botão: marca-se no círculo, ou faz-se na web.
 */
function mobileTarget(groupId: string, key: SetupItemKey): string | null {
  if (key === 'MEMBERS') return `/org/${groupId}/invite-members`;
  if (key === 'CHALLENGE') return `/org/${groupId}/first-challenge`;
  if (key === 'EQUIPMENT') return `/org/${groupId}/exercises`;
  if (key === 'CATEGORIES') return `/org/${groupId}/settings`;
  return null;
}

/** O título do item no app (a prancha Onb-C3 diz "alunos" e junta a entrada). */
const MOBILE_TITLE: Partial<Record<SetupItemKey, string>> = {
  MEMBERS: 'Convidar alunos',
  ACCESS: 'Entrada, visibilidade e quem posta',
};

/**
 * O checklist no celular (#372, prancha Onb-C3) — o mesmo estado da web
 * (`apps/web/src/components/org/setup-guide.tsx`): o círculo marca e desmarca
 * à mão; o que a ação já fez fica marcado; "Abrir" leva à tela do passo.
 */
export function SetupChecklist({ g, setup }: { g: MyGroup; setup: CommunitySetup }) {
  const router = useRouter();
  const { step, guide } = useSetupActions(g.id);
  const primeiros = setup.items.filter((i) => SETUP_FIRST_ITEMS.includes(i.key));
  const juntos = primeiros.every((i) => i.done);
  const resto = juntos
    ? setup.items.filter((i) => !SETUP_FIRST_ITEMS.includes(i.key))
    : setup.items;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1" />
        <Button
          variant="text"
          size="sm"
          onPress={() => void Linking.openURL(setup.webUrl)}
          accessibilityLabel="Ver o painel na web"
        >
          Ver na web
        </Button>
      </View>
      <View className="gap-1 rounded-card bg-card p-5">
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Text accessibilityRole="header" className="font-display text-xl text-foreground">
              {setup.complete ? 'Comunidade pronta' : 'Primeiros passos'}
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              {setup.complete
                ? 'Tudo feito. Esconda o guia quando quiser.'
                : 'Comunidade pronta para o piloto'}
            </Text>
          </View>
          <Text className="font-display text-3xl text-foreground">
            {setup.done}
            <Text className="text-base text-muted-foreground">/{setup.total}</Text>
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Passos feitos"
          accessibilityValue={{ min: 0, max: setup.total, now: setup.done }}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: setupPercent(setup) as `${number}%` }}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ver a comunidade de demonstração, na web"
          onPress={() => void Linking.openURL(`${setup.webUrl}/demo`)}
          className="mt-3 flex-row items-center gap-3 rounded-2xl bg-brand/20 p-3 active:opacity-80"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-brand">
            <Icon name="eye" size={16} color={colors.brandForeground} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-foreground">
              Ver a comunidade de demonstração
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              uma academia pronta, com membros de exemplo
            </Text>
          </View>
          <Icon name="chevR" size={18} color={colors.mutedForeground} />
        </Pressable>

        {juntos ? (
          <View className="min-h-[44px] flex-row items-center gap-3">
            <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
              <Icon name="check" size={14} color={colors.primaryForeground} />
            </View>
            <Text className="flex-1 text-[15px] text-muted-foreground line-through">
              {primeiros
                .map((i) => SETUP_ITEM_COPY[i.key].title.replace(' obrigatórias', ''))
                .join(' · ')}
            </Text>
          </View>
        ) : null}
        {resto.map((i) => (
          <ChecklistRow
            key={i.key}
            item={i}
            busy={step.isPending && step.variables?.key === i.key}
            onToggle={(on) => step.mutate({ key: i.key as ManualSetupStep, on })}
            onOpen={(() => {
              const to = mobileTarget(g.id, i.key);
              return to && !i.done ? () => router.push(to as never) : null;
            })()}
          />
        ))}
      </View>
      <Text className="text-center text-[13px] text-muted-foreground">
        Toque no círculo para marcar · some ao completar
      </Text>
      <Button
        variant="text"
        size="sm"
        loading={guide.isPending}
        onPress={() => guide.mutate(false)}
      >
        Esconder o guia
      </Button>
    </View>
  );
}

function ChecklistRow({
  item,
  busy,
  onToggle,
  onOpen,
}: {
  item: SetupItemState;
  busy: boolean;
  onToggle: (on: boolean) => void;
  onOpen: (() => void) | null;
}) {
  const action = setupItemAction(item);
  const title = MOBILE_TITLE[item.key] ?? SETUP_ITEM_COPY[item.key].title;
  const manual = action !== 'done';
  return (
    <View className="min-h-[52px] flex-row items-center gap-3">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: !manual || busy }}
        accessibilityLabel={`Marcar "${title}" como feito`}
        disabled={!manual || busy}
        hitSlop={8}
        onPress={() => onToggle(!item.done)}
        className={cn(
          'h-7 w-7 items-center justify-center rounded-full border-2',
          item.done ? 'border-primary bg-primary' : 'border-border-strong',
        )}
      >
        {item.done ? <Icon name="check" size={14} color={colors.primaryForeground} /> : null}
      </Pressable>
      <Text
        className={cn(
          'flex-1 text-[16px]',
          item.done ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {title}
      </Text>
      {onOpen ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={onOpen}
          accessibilityLabel={`Abrir: ${title}`}
        >
          Abrir
        </Button>
      ) : null}
    </View>
  );
}

/** "Repetir o guia" (no app, no fim do Início do dono com o guia escondido). */
export function RepeatGuideButton({ groupId }: { groupId: string }) {
  const { guide } = useSetupActions(groupId);
  return (
    <Button variant="outline" loading={guide.isPending} onPress={() => guide.mutate(true)}>
      Repetir o guia
    </Button>
  );
}
