import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  benefitDraftToInput,
  benefitDraftToPatch,
  benefitsApi,
  benefitToDraft,
  benefitValidity,
  benefitValidUntilOptions,
  emptyBenefitDraft,
  type BenefitDraft,
  type BenefitDraftErrors,
  type BenefitKind,
  type MyGroup,
  type TeamBenefit,
} from '@fatia/api-client';
import { apiMessage, Choice, OrgPanel, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, useConfirm } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';

const KEY = (groupId: string) => ['community', 'org', groupId, 'benefits'] as const;

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' }).format(new Date());
}

function FieldError({ text }: { text?: string }) {
  return text ? <Text className="text-xs text-destructive">{text}</Text> : null;
}

/**
 * Cadastrar ou editar um benefício no app. A validade vai em escolhas prontas
 * (fim do mês); o logo e a data livre ficam no painel da web.
 */
function BenefitForm({
  g,
  today,
  editing,
  onDone,
}: {
  g: MyGroup;
  today: string;
  editing: TeamBenefit | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const opcoes = useMemo(() => benefitValidUntilOptions(today), [today]);
  const [draft, setDraft] = useState<BenefitDraft>(() =>
    editing
      ? benefitToDraft(editing)
      : { ...emptyBenefitDraft(today), validUntil: opcoes[0].value },
  );
  const [errors, setErrors] = useState<BenefitDraftErrors>({});
  const set = <K extends keyof BenefitDraft>(k: K, v: BenefitDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const validade = [
    ...(editing && !opcoes.some((o) => o.value === editing.validUntil)
      ? [
          {
            value: editing.validUntil,
            label: `manter ${benefitValidity({ validUntil: editing.validUntil, expired: false })}`,
          },
        ]
      : []),
    ...opcoes,
  ];

  const done = (msg: string) => {
    toast.show({ message: msg });
    void qc.invalidateQueries({ queryKey: KEY(g.id) });
    void qc.invalidateQueries({ queryKey: ['community', 'benefits', g.id] });
    onDone();
  };
  const salvar = useMutation({
    mutationFn: async () => {
      if (editing) {
        // PATCH: a validade só vai se mudou (corrigir o texto de um vencido pode).
        const p = benefitDraftToPatch(draft, today, editing);
        if (!p.ok) throw new Error('invalid');
        return benefitsApi.update(g.id, editing.id, p.input);
      }
      const r = benefitDraftToInput(draft, today);
      if (!r.ok) throw new Error('invalid');
      return benefitsApi.create(g.id, r.input);
    },
    onSuccess: () => done('Benefício salvo · aparece em Comunidade → Benefícios'),
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para salvar o benefício agora.') }),
  });
  const remover = useMutation({
    mutationFn: () => benefitsApi.remove(g.id, editing!.id),
    onSuccess: () => done('Benefício removido.'),
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para remover agora.') }),
  });

  function submit() {
    const r = editing
      ? benefitDraftToPatch(draft, today, editing)
      : benefitDraftToInput(draft, today);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    salvar.mutate();
  }

  return (
    <PanelCard title={editing ? 'Editar benefício' : 'Benefício de parceiro'}>
      <Input
        accessibilityLabel="Parceiro"
        placeholder="Parceiro. Ex.: Suplementa"
        maxLength={60}
        value={draft.partnerName}
        onChangeText={(t) => set('partnerName', t)}
      />
      <FieldError text={errors.partnerName} />
      <Input
        accessibilityLabel="Desconto"
        placeholder="Desconto. Ex.: 15% em suplementos"
        maxLength={80}
        value={draft.discountText}
        onChangeText={(t) => set('discountText', t)}
      />
      <FieldError text={errors.discountText} />
      <Choice<BenefitKind>
        label="Como usar"
        options={[
          { value: 'COUPON', label: 'Cupom' },
          { value: 'LINK', label: 'Link' },
        ]}
        value={draft.kind}
        onChange={(k) => set('kind', k)}
      />
      {draft.kind === 'COUPON' ? (
        <>
          <Input
            accessibilityLabel="Código do cupom"
            placeholder="Código do cupom"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            value={draft.couponCode}
            onChangeText={(t) => set('couponCode', t)}
          />
          <FieldError text={errors.couponCode} />
        </>
      ) : (
        <>
          <Input
            accessibilityLabel="Link do parceiro"
            placeholder="https://"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={draft.url}
            onChangeText={(t) => set('url', t)}
          />
          <FieldError text={errors.url} />
        </>
      )}
      <Choice
        label="Validade"
        options={validade}
        value={draft.validUntil}
        onChange={(v) => set('validUntil', v)}
      />
      <FieldError text={errors.validUntil} />
      <Text className="text-xs text-muted-foreground">
        Depois da validade o benefício sai sozinho do app.
      </Text>
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1" loading={salvar.isPending} onPress={submit}>
          Salvar
        </Button>
      </View>
      {editing ? (
        <Button
          variant="ghost"
          textClassName="text-destructive"
          loading={remover.isPending}
          onPress={() =>
            confirm({
              title: `Remover ${editing.partnerName}?`,
              description:
                'O benefício sai do app na hora. Os membros que já copiaram o cupom continuam com ele.',
              confirmLabel: 'Remover',
              destructive: true,
              onConfirm: () => remover.mutate(),
            })
          }
        >
          Remover
        </Button>
      ) : null}
    </PanelCard>
  );
}

function Beneficios({ g }: { g: MyGroup }) {
  const today = useMemo(() => todayIn(g.timezone), [g.timezone]);
  const [form, setForm] = useState<{ editing: TeamBenefit | null } | null>(null);
  const lista = useQuery({ queryKey: KEY(g.id), queryFn: () => benefitsApi.manage(g.id) });

  if (lista.isPending) return <LoadingState />;
  const itens = lista.data ?? [];

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        Descontos para os membros. A academia combina com o parceiro; o Fatia só mostra. Sem
        benefício ativo, a seção some do app.
      </Text>
      {form ? (
        <BenefitForm
          key={form.editing?.id ?? 'novo'}
          g={g}
          today={today}
          editing={form.editing}
          onDone={() => setForm(null)}
        />
      ) : (
        <Button onPress={() => setForm({ editing: null })}>Adicionar benefício</Button>
      )}
      {itens.length === 0 && !form ? (
        <EmptyState
          title="Nenhum benefício ainda"
          description="Cadastre um desconto que a academia combinou com um parceiro. Os membros veem em Comunidade → Benefícios."
        />
      ) : null}
      {itens.map((b) => {
        const ativo = b.status === 'active';
        return (
          <PanelCard key={b.id}>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-semibold text-foreground">{b.partnerName}</Text>
              <Badge variant={ativo ? 'done' : 'pending'}>{ativo ? 'ativo' : 'expirado'}</Badge>
            </View>
            <Text className="text-xs text-muted-foreground">
              {`${b.discountText} · ${b.kind === 'COUPON' ? `cupom ${b.couponCode}` : 'link'} · ${benefitValidity({ validUntil: b.validUntil, expired: !ativo })}`}
            </Text>
            <Button variant="outline" onPress={() => setForm({ editing: b })}>
              Editar
            </Button>
          </PanelCard>
        );
      })}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/benefits/page.tsx` (Pn-28). */
export default function OrgBenefitsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Beneficios g={g} />}</OrgPanel>;
}
