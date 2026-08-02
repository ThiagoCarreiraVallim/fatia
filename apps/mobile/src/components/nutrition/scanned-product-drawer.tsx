import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  nutritionApi,
  type BarcodeLookup,
  type MealType,
  type OffAttribution,
} from '@fatia/api-client';
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
import { NUMEROS_TABULARES, mensagemDeErro, parseNaoNegativo, parsePositivo } from './helpers';
import {
  formularioAPartirDaFicha,
  itemDeRefeicaoDoProduto,
  mensagemDeFichaIncompleta,
  nomeDoProduto,
  opcoesDePorcao,
  previaDoProduto,
  unidadeDaBase,
} from './barcode';

/**
 * Confirmação do produto escaneado (#140).
 *
 * O produto **não** virou `Food` no banco — a consulta ao Open Food Facts não
 * persiste nada (ADR 017). O item entra na refeição como item livre, com os
 * macros do rótulo congelados no momento do registro, que é como o app já trata
 * item sem alimento de catálogo.
 *
 * Quando a ficha vem incompleta, o drawer abre no formulário com o que veio e
 * os campos que faltam **em branco** — nunca zero.
 */

type ItemDaRefeicao = Parameters<typeof nutritionApi.addItem>[1];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultado: BarcodeLookup;
  /** Com `mealId`, adiciona à refeição. Sem ele, cria uma refeição nova. */
  mealId?: string;
  mealType?: MealType;
  date: string;
  onRegistrado: () => void;
}

export function ScannedProductDrawer({
  open,
  onOpenChange,
  resultado,
  mealId,
  mealType,
  date,
  onRegistrado,
}: Props) {
  const qc = useQueryClient();

  const adicionar = useMutation<unknown, Error, ItemDaRefeicao>({
    mutationFn: (payload) => {
      if (mealId) return nutritionApi.addItem(mealId, payload);
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: new Date().toISOString(),
        items: [payload],
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

  const erro = adicionar.error
    ? mensagemDeErro(adicionar.error, { alternativa: 'Não foi possível salvar. Tente de novo.' })
    : undefined;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <View className="flex-1 bg-background">
        <DrawerHeader>
          <DrawerTitle>Produto escaneado</DrawerTitle>
          <DrawerDescription>
            {resultado.status === 'ok'
              ? 'Confira a quantidade e registre.'
              : 'A ficha veio incompleta — complete pelo rótulo.'}
          </DrawerDescription>
        </DrawerHeader>

        {resultado.status === 'ok' ? (
          <PainelDoProduto
            // O código de barras como `key` reinicia quantidade e formulário
            // quando outro produto é escaneado sem fechar o drawer. Sincronizar
            // por efeito custaria um render a mais e o aviso de `setState`
            // dentro de efeito (#187).
            key={resultado.product.barcode}
            resultado={resultado}
            enviando={adicionar.isPending}
            erro={erro}
            onSubmit={(quantidade) =>
              adicionar.mutate(itemDeRefeicaoDoProduto(resultado.product, quantidade))
            }
          />
        ) : (
          <PainelIncompleto
            key={resultado.partial.barcode}
            resultado={resultado}
            enviando={adicionar.isPending}
            erro={erro}
            onSubmit={(payload) => adicionar.mutate(payload)}
          />
        )}

        <DrawerFooter className="pb-6">
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DrawerFooter>
      </View>
    </Drawer>
  );
}

function PainelDoProduto({
  resultado,
  onSubmit,
  enviando,
  erro,
}: {
  resultado: Extract<BarcodeLookup, { status: 'ok' }>;
  onSubmit: (quantidade: number) => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const { product } = resultado;
  const opcoes = opcoesDePorcao(product);
  const unidade = unidadeDaBase(product.basis);
  const [quantidade, setQuantidade] = useState(String(opcoes[0].quantidade));

  const previa = previaDoProduto(product, quantidade);
  const valor = parsePositivo(quantidade);

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-lg border border-border p-3">
        <Text className="text-sm font-medium text-foreground">{nomeDoProduto(product)}</Text>
        <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          {Math.round(product.kcalPer100g)} kcal/100 {unidade} · P
          {Math.round(product.proteinPer100g)} · C{Math.round(product.carbsPer100g)} · G
          {Math.round(product.fatPer100g)}
        </Text>
      </View>

      {product.basis === '100ml' ? (
        <Text className="text-xs text-[#facc15]">
          O rótulo é por 100 ml. O registro é em gramas, contando 1 ml como 1 g.
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {opcoes.map((opcao) => (
          <Pressable
            key={opcao.rotulo}
            accessibilityRole="button"
            accessibilityLabel={opcao.rotulo}
            onPress={() => setQuantidade(String(opcao.quantidade))}
            className="min-h-[44px] justify-center rounded-md border border-border px-3 active:bg-accent"
          >
            <Text className="text-sm text-foreground">{opcao.rotulo}</Text>
          </Pressable>
        ))}
      </View>

      <DrawerInput
        label={`Quantidade (${unidade})`}
        keyboardType="numeric"
        inputMode="decimal"
        value={quantidade}
        onChangeText={setQuantidade}
      />

      {previa ? (
        <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
          Total: {previa.kcal} kcal · P{previa.proteinG} · C{previa.carbsG} · G{previa.fatG}
        </Text>
      ) : null}

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <Button
        onPress={() => valor !== null && onSubmit(valor)}
        disabled={valor === null || enviando}
        loading={enviando}
      >
        Adicionar
      </Button>

      <Atribuicao attribution={resultado.attribution} />
    </DrawerScrollView>
  );
}

function PainelIncompleto({
  resultado,
  onSubmit,
  enviando,
  erro,
}: {
  resultado: Extract<BarcodeLookup, { status: 'incomplete' }>;
  onSubmit: (payload: ItemDaRefeicao) => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const [valores, setValores] = useState(() => formularioAPartirDaFicha(resultado.partial));
  const unidade = unidadeDaBase(resultado.partial.basis);

  const definir = (campo: keyof typeof valores) => (texto: string) =>
    setValores((anterior) => ({ ...anterior, [campo]: texto }));

  const gramas = parsePositivo(valores.grams);
  const podeEnviar = valores.name.trim().length > 0 && gramas !== null;

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="alert" className="text-sm text-[#facc15]">
        {mensagemDeFichaIncompleta(resultado.missing)}
      </Text>

      <DrawerInput
        label="Nome"
        value={valores.name}
        onChangeText={definir('name')}
        maxLength={160}
      />
      <DrawerInput
        label={`Quantidade (${unidade})`}
        keyboardType="numeric"
        inputMode="decimal"
        value={valores.grams}
        onChangeText={definir('grams')}
      />

      <View className="flex-row gap-2">
        {(
          [
            ['kcal', 'kcal'],
            ['proteinG', 'P (g)'],
            ['carbsG', 'C (g)'],
            ['fatG', 'G (g)'],
          ] as const
        ).map(([campo, rotulo]) => (
          <View key={campo} className="flex-1">
            <DrawerInput
              label={rotulo}
              labelClassName="text-xs text-muted-foreground"
              keyboardType="numeric"
              inputMode="decimal"
              value={valores[campo]}
              onChangeText={definir(campo)}
            />
          </View>
        ))}
      </View>

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <Button
        onPress={() => {
          if (gramas === null) return;
          onSubmit({
            foodName: valores.name.trim(),
            grams: gramas,
            kcal: parseNaoNegativo(valores.kcal),
            proteinG: parseNaoNegativo(valores.proteinG),
            carbsG: parseNaoNegativo(valores.carbsG),
            fatG: parseNaoNegativo(valores.fatG),
          });
        }}
        disabled={!podeEnviar || enviando}
        loading={enviando}
      >
        Adicionar
      </Button>

      <Atribuicao attribution={resultado.attribution} />
    </DrawerScrollView>
  );
}

/**
 * Crédito ao Open Food Facts, exigido pela ODbL (ADR 017).
 *
 * Fica na tela onde o dado aparece, não numa página de créditos escondida: é o
 * que "atribuição visível" quer dizer. O link leva à ficha de origem, que é
 * também por onde a pessoa corrige um rótulo errado.
 */
function Atribuicao({ attribution }: { attribution: OffAttribution }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Dados de ${attribution.source}, licença ${attribution.license}`}
      onPress={() => void Linking.openURL(attribution.url)}
      className="min-h-[44px] justify-center"
    >
      <Text className="text-xs text-muted-foreground">
        Dados do produto: {attribution.source} · {attribution.license}
      </Text>
    </Pressable>
  );
}
