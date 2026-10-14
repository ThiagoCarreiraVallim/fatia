import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Square } from 'lucide-react-native';
import {
  baseUnit,
  customFoodFromProduct,
  customFoodFromProductForm,
  findSavedProduct,
  incompleteProductMessage,
  mealItemFromProduct,
  mealItemFromProductForm,
  nutritionApi,
  productFormFromPartial,
  productName,
  productPreview,
  savedProductItem,
  servingOptions,
  type BarcodeLookup,
  type CustomFoodInput,
  type CustomFoodParse,
  type Food,
  type ScannedMealItem,
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
import { NUMEROS_TABULARES, instanteNoDia, mensagemDeErro, parsePositivo } from './helpers';

/**
 * Confirmação do produto escaneado (#140).
 *
 * O produto **não** virou `Food` no banco — a consulta ao Open Food Facts não
 * persiste nada (ADR 017). O item entra na refeição como item livre, com os
 * macros do rótulo congelados no momento do registro, que é como o app já trata
 * item sem alimento de catálogo.
 *
 * Quando a ficha vem incompleta, o drawer abre no formulário com o que veio e
 * os campos que faltam **em branco** — nunca zero. Os quatro macros são por 100
 * (a coluna do rótulo), a quantidade é separada e o total aparece calculado,
 * como no painel do produto completo: campo cujo significado dependia da
 * quantidade era o que fazia 50 g de açúcar entrarem com as 20 kcal da porção
 * de 5 g.
 *
 * "Guardar em Meus alimentos" é escolha da pessoa: cria o alimento próprio e o
 * item entra ligado a ele (ADR 017, atualização). Produto já guardado entra
 * ligado ao existente, sem criar outro.
 */

type ItemDaRefeicao = Parameters<typeof nutritionApi.addItem>[1];

interface Escolha {
  item: ScannedMealItem;
  /** Alimento já guardado com esse nome. */
  guardado?: Food;
  /** O que criar em Meus alimentos, quando a pessoa marcou "Guardar". */
  guardar?: CustomFoodInput;
}

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

  const meusAlimentos = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
    enabled: open,
  });

  const adicionar = useMutation<unknown, Error, Escolha>({
    mutationFn: async ({ item, guardado, guardar }) => {
      let payload: ItemDaRefeicao = item;
      if (guardado || guardar) {
        const alimento = guardado ?? (await nutritionApi.createCustomFood(guardar!));
        payload = savedProductItem(alimento, item.grams);
      }
      if (mealId) return nutritionApi.addItem(mealId, payload);
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        // O dia é o da tela, não o de hoje: a mesma `date` que invalida o cache
        // abaixo. Ver `instanteNoDia`.
        eatenAt: instanteNoDia(date),
        items: [payload],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      onOpenChange(false);
      onRegistrado();
    },
    // Mesmo se a refeição falhar depois de guardar, a lista precisa saber do
    // alimento novo: a próxima tentativa o encontra em vez de esbarrar no 409.
    onSettled: (_r, _e, { guardar }) => {
      if (!guardar) return;
      void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    },
  });
  const guardados = meusAlimentos.data ?? [];

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
            guardados={guardados}
            enviando={adicionar.isPending}
            erro={erro}
            onSubmit={(escolha) => adicionar.mutate(escolha)}
          />
        ) : (
          <PainelIncompleto
            key={resultado.partial.barcode}
            resultado={resultado}
            guardados={guardados}
            enviando={adicionar.isPending}
            erro={erro}
            onSubmit={(escolha) => adicionar.mutate(escolha)}
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
  guardados,
  onSubmit,
  enviando,
  erro,
}: {
  resultado: Extract<BarcodeLookup, { status: 'ok' }>;
  guardados: Food[];
  onSubmit: (escolha: Escolha) => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const { product } = resultado;
  const opcoes = servingOptions(product);
  const unidade = baseUnit(product.basis);
  const [quantidade, setQuantidade] = useState(String(opcoes[0].amount));
  const [guardar, setGuardar] = useState(false);

  const previa = productPreview(product, quantidade);
  const valor = parsePositivo(quantidade.replace(',', '.'));
  const guardado = findSavedProduct(guardados, productName(product));
  const cadastro = guardar && !guardado ? customFoodFromProduct(product) : null;
  const bloqueado = valor === null || (cadastro !== null && !cadastro.ok);

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-lg border border-border p-3">
        <Text className="text-sm font-medium text-foreground">{productName(product)}</Text>
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
            key={opcao.label}
            accessibilityRole="button"
            accessibilityLabel={opcao.label}
            onPress={() => setQuantidade(String(opcao.amount))}
            className="min-h-[44px] justify-center rounded-md border border-border px-3 active:bg-accent"
          >
            <Text className="text-sm text-foreground">{opcao.label}</Text>
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

      <OpcaoDeGuardar
        guardado={guardado}
        guardar={guardar}
        onGuardarChange={setGuardar}
        cadastro={cadastro}
      />

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <Button
        onPress={() =>
          !bloqueado &&
          onSubmit({
            item: mealItemFromProduct(product, valor),
            guardado,
            guardar: cadastro?.ok ? cadastro.input : undefined,
          })
        }
        disabled={bloqueado || enviando}
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
  guardados,
  onSubmit,
  enviando,
  erro,
}: {
  resultado: Extract<BarcodeLookup, { status: 'incomplete' }>;
  guardados: Food[];
  onSubmit: (escolha: Escolha) => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const [valores, setValores] = useState(() => productFormFromPartial(resultado.partial));
  const unidade = baseUnit(resultado.partial.basis);

  const definir = (campo: keyof typeof valores) => (texto: string) =>
    setValores((anterior) => ({ ...anterior, [campo]: texto }));

  // Uma decisão só para habilitar o botão e para montar o payload: enquanto
  // faltar campo, não há item — e não há como o branco virar zero na API.
  const item = mealItemFromProductForm(valores);
  const [guardar, setGuardar] = useState(false);
  const guardado = valores.name.trim() ? findSavedProduct(guardados, valores.name) : undefined;
  const cadastro = guardar && !guardado ? customFoodFromProductForm(valores) : null;
  const bloqueado = item === null || (cadastro !== null && !cadastro.ok);

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="alert" className="text-sm text-[#facc15]">
        {incompleteProductMessage(resultado.missing)}
      </Text>

      {resultado.partial.basis === '100ml' ? (
        <Text className="text-xs text-[#facc15]">
          O rótulo é por 100 ml. O registro é em gramas, contando 1 ml como 1 g.
        </Text>
      ) : null}

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

      <Text className="text-xs text-muted-foreground">
        Valores por 100 {unidade}, como na tabela do rótulo.
      </Text>

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

      {item ? (
        <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
          Total para {item.grams} {unidade}: {item.kcal} kcal · P{item.proteinG} · C{item.carbsG} ·
          G{item.fatG}
        </Text>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Complete os quatro valores do rótulo para registrar.
        </Text>
      )}

      <OpcaoDeGuardar
        guardado={guardado}
        guardar={guardar}
        onGuardarChange={setGuardar}
        cadastro={cadastro}
      />

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <Button
        onPress={() =>
          !bloqueado &&
          item !== null &&
          onSubmit({ item, guardado, guardar: cadastro?.ok ? cadastro.input : undefined })
        }
        disabled={bloqueado || enviando}
        loading={enviando}
      >
        Adicionar
      </Button>

      <Atribuicao attribution={resultado.attribution} />
    </DrawerScrollView>
  );
}

function OpcaoDeGuardar({
  guardado,
  guardar,
  onGuardarChange,
  cadastro,
}: {
  guardado: Food | undefined;
  guardar: boolean;
  onGuardarChange: (guardar: boolean) => void;
  cadastro: CustomFoodParse | null;
}) {
  if (guardado) {
    return (
      <Text className="text-xs text-muted-foreground">
        Já está em Meus alimentos: o item entra ligado a ele.
      </Text>
    );
  }
  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: guardar }}
        accessibilityLabel="Guardar em Meus alimentos"
        onPress={() => onGuardarChange(!guardar)}
        className="min-h-[44px] flex-row items-center gap-2"
      >
        {guardar ? <Check size={20} color="#2ce500" /> : <Square size={20} color="#8a8a8a" />}
        <Text className="text-sm text-foreground">Guardar em Meus alimentos</Text>
      </Pressable>
      <Text className="text-xs text-muted-foreground">
        Na próxima vez, ele aparece na busca sem precisar escanear.
      </Text>
      {cadastro && !cadastro.ok ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {`Não dá para guardar: ${Object.values(cadastro.errors).filter(Boolean).join(' ')}`}
        </Text>
      ) : null}
    </View>
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
