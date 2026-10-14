import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import {
  dayLabel,
  defaultCopyTarget,
  nutritionApi,
  type Meal,
  type MealTemplate,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui';
import { CopiarParaDia } from './copiar-para-dia';
import { DrawerInput } from './drawer-input';
import { ROTULO_REFEICAO, formatarHora, hojeIso, mensagemDeErro } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/meal-actions-drawer.tsx`: copiar
 * a refeição para outro dia ou salvá-la para registrar de novo num toque.
 *
 * Drawer, e não `Alert` com opções: no Android o `Alert` aceita só três botões,
 * e copiar pede escolher o dia.
 */
export function AcoesDaRefeicaoDrawer({
  meal,
  date,
  onClose,
  onVerDia,
}: {
  meal: Meal | null;
  date: string;
  onClose: () => void;
  onVerDia: (dia: string) => void;
}) {
  return (
    <Drawer open={meal !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DrawerContent>
        {/* `key`: outra refeição começa com o formulário limpo. */}
        {meal ? (
          <Acoes key={meal.id} meal={meal} date={date} onClose={onClose} onVerDia={onVerDia} />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function Acoes({
  meal,
  date,
  onClose,
  onVerDia,
}: {
  meal: Meal;
  date: string;
  onClose: () => void;
  onVerDia: (dia: string) => void;
}) {
  const qc = useQueryClient();
  const hoje = hojeIso();
  const rotulo = ROTULO_REFEICAO[meal.mealType];

  // A última cópia feita fica à vista mesmo se a próxima tentativa falhar.
  const [copiada, setCopiada] = useState<string | null>(null);
  const copiar = useMutation<Meal, Error, string>({
    mutationFn: (toDate) => nutritionApi.copyMeal(meal.id, { toDate }),
    onSuccess: (_meal, toDate) => {
      setCopiada(toDate);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const [nome, setNome] = useState(rotulo);
  const salvar = useMutation<MealTemplate, Error, string>({
    mutationFn: (name) => nutritionApi.createMealTemplate({ name, mealId: meal.id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] }),
  });

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{`${rotulo} · ${formatarHora(meal.eatenAt)}`}</DrawerTitle>
        <DrawerDescription>
          Copie para outro dia ou salve para registrar de novo num toque.
        </DrawerDescription>
      </DrawerHeader>

      <View className="gap-5 px-4 py-3">
        <View className="gap-2">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Copiar
          </Text>
          <CopiarParaDia
            diaPadrao={defaultCopyTarget(date, hoje)}
            hoje={hoje}
            pendente={copiar.isPending}
            erro={
              copiar.error
                ? mensagemDeErro(copiar.error, {
                    conflito: 'Essa refeição já foi copiada para esse dia.',
                  })
                : null
            }
            feito={
              copiada ? { texto: `Copiada para ${dayLabel(copiada, hoje)}`, dia: copiada } : null
            }
            onCopiar={(dia) => copiar.mutate(dia)}
            onVer={(dia) => {
              onVerDia(dia);
              onClose();
            }}
          />
        </View>

        <View className="gap-2">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Salvar como refeição salva
          </Text>
          {salvar.data ? (
            <View className="flex-row items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
              <Check size={16} color="#2ce500" />
              <Text className="flex-1 text-sm text-primary">
                {`"${salvar.data.name}" salva. Ela aparece ao registrar uma refeição.`}
              </Text>
            </View>
          ) : (
            <>
              <DrawerInput
                label="Nome da refeição salva"
                maxLength={60}
                value={nome}
                onChangeText={setNome}
              />
              <Button
                variant="outline"
                onPress={() => salvar.mutate(nome.trim())}
                disabled={!nome.trim() || salvar.isPending}
                loading={salvar.isPending}
              >
                Salvar refeição
              </Button>
              {salvar.error ? (
                <Text accessibilityRole="alert" className="text-sm text-destructive">
                  {mensagemDeErro(salvar.error, {
                    conflito: 'Já existe uma refeição salva com esse nome.',
                  })}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      <DrawerFooter>
        <Button variant="ghost" onPress={onClose}>
          Fechar
        </Button>
      </DrawerFooter>
    </>
  );
}
