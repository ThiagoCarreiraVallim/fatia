import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Square } from 'lucide-react-native';
import { nutritionApi, type MealRecognition, type MealType } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
} from '@/components/ui';
import { DrawerInput } from './drawer-input';
import { NUMEROS_TABULARES, instanteNoDia, mensagemDeErro } from './helpers';
import {
  faixaDeConfianca,
  itensDeRefeicao,
  itensEditaveis,
  itensParaGravar,
  mensagemDeFotoSemComida,
  podeGravar,
  previaDoItem,
  ROTULO_DE_CONFIANCA,
  type ItemEditavel,
} from './recognition-mapping';

/**
 * Tela de confirmação do reconhecimento por foto (#139). **Obrigatória.**
 *
 * Não é uma disciplina que alguém pode pular: o reconhecimento não grava nada, e
 * este drawer é o único lugar de onde sai um `createMeal`/`addItem`. Gravar o
 * palpite do modelo direto é como se acumula erro silencioso no histórico.
 *
 * Três coisas que a tela mostra de propósito, e que custam espaço:
 *
 * - **qual alimento da TACO casou**, e não só o nome que o modelo disse.
 *   "Mandioca frita" casa com "Mandioca, frita", e o preparo é o que decide o
 *   macro — "Mandioca, crua" tem metade da caloria. A API só casa quando o nome
 *   determina uma entrada só ("mandioca" sozinho não casa), mas quem confere se
 *   acertou é quem está olhando o prato;
 * - **a confiança**, para ordenar a leitura e pintar de amarelo o duvidoso — ela
 *   nunca esconde item nem decide nada;
 * - **que o macro é estimado**, quando não houve casamento.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultado: MealRecognition;
  /** Com `mealId`, adiciona à refeição. Sem ele, cria uma refeição nova. */
  mealId?: string;
  mealType?: MealType;
  date: string;
  onRegistrado: () => void;
  /** Leva ao registro manual, que é o caminho que sempre funciona. */
  onRegistrarManualmente: () => void;
}

export function RecognitionReviewDrawer({
  open,
  onOpenChange,
  resultado,
  mealId,
  mealType,
  date,
  onRegistrado,
  onRegistrarManualmente,
}: Props) {
  const qc = useQueryClient();
  const [itens, setItens] = useState<ItemEditavel[]>(() => itensEditaveis(resultado));

  const gravar = useMutation({
    mutationFn: async () => {
      const payload = itensDeRefeicao(itens);
      if (mealId) {
        // Um por vez: a API não tem rota de lote para item, e inventar uma aqui
        // seria caminho de escrita novo — justamente o que este desenho evita.
        for (const item of payload) await nutritionApi.addItem(mealId, item);
        return;
      }
      await nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: instanteNoDia(date),
        items: payload,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      onOpenChange(false);
      onRegistrado();
    },
  });

  const alterar = (chave: string, mudanca: Partial<ItemEditavel>) =>
    setItens((anterior) =>
      anterior.map((item) => (item.chave === chave ? { ...item, ...mudanca } : item)),
    );

  const prontos = itensParaGravar(itens);
  const erro = gravar.error
    ? mensagemDeErro(gravar.error, {
        // A API recusa refeição duplicada com 409. "Falha ao salvar" faria a
        // pessoa fotografar de novo e duplicar de verdade na terceira tentativa.
        conflito: 'Essa refeição já foi registrada. Confira o dia antes de registrar de novo.',
        alternativa: 'Não foi possível registrar. Tente de novo.',
      })
    : undefined;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['88%']}>
      <View className="flex-1 bg-background">
        <DrawerHeader>
          <DrawerTitle>Confira o que a IA entendeu</DrawerTitle>
          <DrawerDescription>
            Nada foi registrado ainda. Ajuste as porções, desmarque o que não estava no prato e
            confirme.
          </DrawerDescription>
        </DrawerHeader>

        {itens.length === 0 ? (
          <View className="flex-1 justify-center gap-4 px-4">
            <Text accessibilityRole="alert" className="text-center text-sm text-muted-foreground">
              {mensagemDeFotoSemComida(resultado.observacao)}
            </Text>
            <Button onPress={onRegistrarManualmente}>Buscar alimento</Button>
          </View>
        ) : (
          <DrawerScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {resultado.observacao ? (
              <Text className="text-xs text-muted-foreground">{resultado.observacao}</Text>
            ) : null}

            {itens.map((item) => (
              <LinhaDoItem
                key={item.chave}
                item={item}
                onAlterar={(mudanca) => alterar(item.chave, mudanca)}
              />
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={onRegistrarManualmente}
              className="min-h-[44px] justify-center"
            >
              <Text className="text-sm text-muted-foreground underline">
                Faltou algo? Buscar alimento à mão
              </Text>
            </Pressable>
          </DrawerScrollView>
        )}

        <DrawerFooter className="gap-2 pb-6">
          {erro ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {erro}
            </Text>
          ) : null}

          {itens.length > 0 ? (
            <Button
              onPress={() => gravar.mutate()}
              disabled={prontos.length === 0 || gravar.isPending}
              loading={gravar.isPending}
            >
              {prontos.length === 1 ? 'Registrar 1 item' : `Registrar ${prontos.length} itens`}
            </Button>
          ) : null}
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DrawerFooter>
      </View>
    </Drawer>
  );
}

/** Cores da faixa de confiança. Amarelo avisa; nunca esconde. */
const COR_DA_CONFIANCA = {
  alta: '#baccaf',
  media: '#facc15',
  baixa: '#facc15',
} as const;

function LinhaDoItem({
  item,
  onAlterar,
}: {
  item: ItemEditavel;
  onAlterar: (mudanca: Partial<ItemEditavel>) => void;
}) {
  const faixa = faixaDeConfianca(item.confidence);
  const previa = previaDoItem(item);
  const gravavel = podeGravar(item);

  return (
    <View className="gap-2 rounded-lg border border-border p-3">
      <View className="flex-row items-start gap-3">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.incluido }}
          accessibilityLabel={`Incluir ${item.nomeReconhecido}`}
          onPress={() => onAlterar({ incluido: !item.incluido })}
          className="h-11 w-11 items-center justify-center"
        >
          {item.incluido ? (
            <Check size={20} color="#2ce500" />
          ) : (
            <Square size={20} color="#8a8a8a" />
          )}
        </Pressable>

        <View className="flex-1 gap-1">
          <Text className="text-sm font-medium text-foreground">{item.nomeReconhecido}</Text>

          {item.nomeDoCatalogo ? (
            // O alimento da tabela aparece por extenso: é ele que define o macro,
            // e esconder qual foi transforma um erro corrigível num macro errado
            // gravado em silêncio.
            <Text className="text-xs text-muted-foreground">
              Tabela TACO: {item.nomeDoCatalogo}
            </Text>
          ) : (
            <Text className="text-xs text-[#facc15]">
              Sem correspondência na tabela — macro estimado pela IA
            </Text>
          )}

          <Text style={{ color: COR_DA_CONFIANCA[faixa] }} className="text-xs">
            {ROTULO_DE_CONFIANCA[faixa]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-end gap-3">
        <View className="w-32">
          <DrawerInput
            label="Porção (g)"
            labelClassName="text-xs text-muted-foreground"
            keyboardType="numeric"
            inputMode="decimal"
            value={item.gramas}
            onChangeText={(texto) => onAlterar({ gramas: texto })}
          />
        </View>

        <View className="flex-1 pb-2">
          {previa ? (
            <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
              {previa.kcal} kcal · P{previa.proteinG} · C{previa.carbsG} · G{previa.fatG}
            </Text>
          ) : item.foodId !== null ? (
            <Text className="text-xs text-muted-foreground">Macro calculado pela tabela.</Text>
          ) : (
            <Text className="text-xs text-destructive">
              Sem macro: busque este alimento à mão para registrá-lo.
            </Text>
          )}
        </View>
      </View>

      {!gravavel && item.incluido ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          Este item não será registrado enquanto estiver assim.
        </Text>
      ) : null}
    </View>
  );
}
