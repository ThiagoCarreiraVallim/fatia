import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { nutritionApi, type Food, type MealType } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFlatList,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
} from '@/components/ui';
import { DrawerInput, estiloDoCampoDoDrawer } from './drawer-input';
import {
  NUMEROS_TABULARES,
  mensagemDeErro,
  parseNaoNegativo,
  parsePositivo,
  previaDoAlimento,
} from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/food-search-drawer.tsx`.
 *
 * É o drawer mais usado do produto, e o teste do PWA
 * (`__tests__/food-search-drawer.test.tsx`) fixa o comportamento que precisa
 * sobreviver ao porte: busca com atraso de 300 ms, troca para o formulário
 * manual, criar refeição nova quando não há `mealId`, adicionar item quando há,
 * botão bloqueado com nome vazio e erro de busca com botão de tentar de novo.
 *
 * Duas coisas são específicas do nativo:
 *
 * - o sheet fixa a altura em 85%, e o conteúdo não passa por `DrawerContent`:
 *   aquele componente dimensiona pelo conteúdo, o que deixaria a lista de
 *   resultados sem altura para rolar;
 * - a lista é `DrawerFlatList` com `keyboardShouldPersistTaps`, senão o
 *   primeiro toque num resultado só fecha o teclado e a pessoa toca duas vezes.
 */

type ItemDaRefeicao = Parameters<typeof nutritionApi.addItem>[1];
type Modo = 'busca' | 'manual';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com `mealId`, adiciona item à refeição. Sem ele, cria uma refeição nova. */
  mealId?: string;
  mealType?: MealType;
  date: string;
}

const MANUAL_INICIAL = { name: '', grams: '100', kcal: '', proteinG: '', carbsG: '', fatG: '' };
type ValoresManuais = typeof MANUAL_INICIAL;

export function FoodSearchDrawer({ open, onOpenChange, mealId, mealType, date }: Props) {
  const [modo, setModo] = useState<Modo>('busca');
  const [busca, setBusca] = useState('');
  const [buscaComAtraso, setBuscaComAtraso] = useState('');
  const [selecionado, setSelecionado] = useState<Food | null>(null);
  const [gramas, setGramas] = useState('100');
  const [manual, setManual] = useState<ValoresManuais>(MANUAL_INICIAL);
  const [nutrientesManuais, setNutrientesManuais] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  // Metas de nutrientes ativas: o item manual pode informá-las (ADR 009).
  const metas = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setModo('busca');
      setBusca('');
      setBuscaComAtraso('');
      setSelecionado(null);
      setGramas('100');
      setManual(MANUAL_INICIAL);
      setNutrientesManuais({});
    }
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setBuscaComAtraso(busca), 300);
    return () => clearTimeout(id);
  }, [busca]);

  const resultados = useQuery({
    queryKey: ['nutrition', 'search', buscaComAtraso],
    queryFn: () => nutritionApi.searchFoods(buscaComAtraso, 20),
    enabled: open && modo === 'busca' && buscaComAtraso.trim().length >= 2,
  });

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
    },
  });

  const erro = adicionar.error
    ? mensagemDeErro(adicionar.error, {
        conflito: mealId
          ? 'Esse item já foi registrado nessa refeição.'
          : 'Essa refeição já foi registrada.',
        alternativa: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;

  const enviarDaBusca = () => {
    if (!selecionado) return;
    const g = parsePositivo(gramas);
    if (g === null) return;
    adicionar.mutate({ foodId: selecionado.id, grams: g });
  };

  const enviarManual = () => {
    const nome = manual.name.trim();
    const g = parsePositivo(manual.grams);
    if (!nome || g === null) return;
    const nutrientes: Record<string, number> = {};
    for (const [chave, valor] of Object.entries(nutrientesManuais)) {
      const n = parseNaoNegativo(valor);
      if (n !== undefined) nutrientes[chave] = n;
    }
    adicionar.mutate({
      foodName: nome,
      grams: g,
      kcal: parseNaoNegativo(manual.kcal),
      proteinG: parseNaoNegativo(manual.proteinG),
      carbsG: parseNaoNegativo(manual.carbsG),
      fatG: parseNaoNegativo(manual.fatG),
      nutrients: Object.keys(nutrientes).length > 0 ? nutrientes : undefined,
    });
  };

  const titulo = mealId ? 'Adicionar item' : 'Nova refeição';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <View className="flex-1 bg-background">
        <DrawerHeader>
          <DrawerTitle>{titulo}</DrawerTitle>
          <DrawerDescription>
            {modo === 'manual'
              ? 'Informe nome e macros do alimento.'
              : 'Busque um alimento da TACO ou seus customs.'}
          </DrawerDescription>
        </DrawerHeader>

        {modo === 'manual' ? (
          <FormularioManual
            valores={manual}
            onChange={setManual}
            metasDeNutrientes={(metas.data ?? []).map((m) => ({
              key: m.nutrientKey,
              label: m.label,
              unit: m.unit,
            }))}
            valoresDeNutrientes={nutrientesManuais}
            onNutrienteChange={(chave, valor) =>
              setNutrientesManuais((anterior) => ({ ...anterior, [chave]: valor }))
            }
            onSubmit={enviarManual}
            onBack={() => {
              setModo('busca');
              adicionar.reset();
            }}
            enviando={adicionar.isPending}
            erro={erro}
          />
        ) : selecionado ? (
          <PainelDoAlimento
            food={selecionado}
            gramas={gramas}
            onGramasChange={setGramas}
            onBack={() => {
              setSelecionado(null);
              adicionar.reset();
            }}
            onSubmit={enviarDaBusca}
            enviando={adicionar.isPending}
            erro={erro}
          />
        ) : (
          <PainelDeBusca
            busca={busca}
            onBuscaChange={setBusca}
            buscaComAtraso={buscaComAtraso}
            buscando={resultados.isFetching}
            comErro={resultados.isError}
            onRetry={() => void resultados.refetch()}
            dados={resultados.data}
            onEscolher={setSelecionado}
            onManual={() => setModo('manual')}
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

function PainelDeBusca({
  busca,
  onBuscaChange,
  buscaComAtraso,
  buscando,
  comErro,
  onRetry,
  dados,
  onEscolher,
  onManual,
}: {
  busca: string;
  onBuscaChange: (valor: string) => void;
  buscaComAtraso: string;
  buscando: boolean;
  comErro: boolean;
  onRetry: () => void;
  dados: Food[] | undefined;
  onEscolher: (food: Food) => void;
  onManual: () => void;
}) {
  return (
    <View className="flex-1">
      <View className="px-4 py-3">
        <View className="relative justify-center">
          {/* `pointerEvents` desligado: o ícone cobre a borda esquerda do campo
              e sem isso o toque ali não abre o teclado. */}
          <View pointerEvents="none" className="absolute left-3 z-10">
            <Search size={16} color="#baccaf" />
          </View>
          <DrawerTextInput
            autoFocus
            accessibilityLabel="Buscar alimento"
            value={busca}
            onChangeText={onBuscaChange}
            placeholder="Ex.: arroz, frango, banana..."
            placeholderTextColor="#8a8a8a"
            selectionColor="#2ce500"
            // Estilo em `style` e não em `className`: ver `drawer-input.tsx`.
            style={[estiloDoCampoDoDrawer, { paddingLeft: 36 }]}
          />
        </View>
      </View>

      <DrawerFlatList
        style={{ flex: 1 }}
        data={dados ?? []}
        keyExtractor={(food: Food) => String(food.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          buscando ? (
            <Text className="px-4 py-3 text-sm text-muted-foreground">Buscando...</Text>
          ) : null
        }
        ListEmptyComponent={
          buscando ? null : comErro ? (
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                Erro ao buscar alimentos.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tentar novamente"
                onPress={onRetry}
                hitSlop={12}
                className="min-h-[44px] justify-center"
              >
                <Text className="text-sm text-primary underline">Tentar novamente</Text>
              </Pressable>
            </View>
          ) : buscaComAtraso.trim().length < 2 ? (
            <Text className="px-4 py-3 text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres.
            </Text>
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado.</Text>
          )
        }
        renderItem={({ item }: { item: Food }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${Math.round(item.kcalPer100g)} quilocalorias por 100 gramas`}
            onPress={() => onEscolher(item)}
            className="min-h-[44px] flex-row items-center justify-between border-b border-border px-4 py-3 active:bg-accent"
          >
            <View className="flex-1 pr-2">
              <Text className="text-sm font-medium text-foreground">{item.name}</Text>
              <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
                {Math.round(item.kcalPer100g)} kcal/100g · P{Math.round(item.proteinPer100g)} · C
                {Math.round(item.carbsPer100g)} · G{Math.round(item.fatPer100g)}
              </Text>
            </View>
            <Text className="rounded bg-muted px-2 py-0.5 text-xs uppercase text-muted-foreground">
              {item.source}
            </Text>
          </Pressable>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Não achei, inserir manualmente"
        onPress={onManual}
        className="min-h-[44px] items-center justify-center px-4"
      >
        <Text className="text-sm text-primary underline">Não achei, inserir manualmente</Text>
      </Pressable>
    </View>
  );
}

function PainelDoAlimento({
  food,
  gramas,
  onGramasChange,
  onBack,
  onSubmit,
  enviando,
  erro,
}: {
  food: Food;
  gramas: string;
  onGramasChange: (valor: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const previa = previaDoAlimento(food, gramas);
  const podeEnviar = parsePositivo(gramas) !== null;

  return (
    <View className="flex-1 gap-4 px-4 py-3">
      <View className="rounded-lg border border-border p-3">
        <Text className="text-sm font-medium text-foreground">{food.name}</Text>
        <Text className="text-xs text-muted-foreground">
          {Math.round(food.kcalPer100g)} kcal/100g
        </Text>
      </View>

      <DrawerInput
        label="Quantidade (g)"
        keyboardType="numeric"
        inputMode="decimal"
        value={gramas}
        onChangeText={onGramasChange}
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

      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onBack}>
          Voltar
        </Button>
        <Button
          className="flex-1"
          onPress={onSubmit}
          disabled={!podeEnviar || enviando}
          loading={enviando}
        >
          Adicionar
        </Button>
      </View>
    </View>
  );
}

function FormularioManual({
  valores,
  onChange,
  metasDeNutrientes,
  valoresDeNutrientes,
  onNutrienteChange,
  onSubmit,
  onBack,
  enviando,
  erro,
}: {
  valores: ValoresManuais;
  onChange: (valores: ValoresManuais) => void;
  metasDeNutrientes: Array<{ key: string; label: string; unit: string }>;
  valoresDeNutrientes: Record<string, string>;
  onNutrienteChange: (chave: string, valor: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const definir = (campo: keyof ValoresManuais) => (valor: string) =>
    onChange({ ...valores, [campo]: valor });

  const podeEnviar = valores.name.trim().length > 0 && parsePositivo(valores.grams) !== null;
  const kcal = parseNaoNegativo(valores.kcal);
  const semKcal = podeEnviar && (kcal === undefined || kcal === 0);

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <DrawerInput
        label="Nome"
        autoFocus
        value={valores.name}
        onChangeText={definir('name')}
        placeholder="Ex.: salada de frutas caseira"
        maxLength={160}
      />
      <DrawerInput
        label="Gramas"
        keyboardType="numeric"
        inputMode="decimal"
        value={valores.grams}
        onChangeText={definir('grams')}
      />

      <View className="flex-row gap-2">
        <View className="flex-1">
          <DrawerInput
            label="kcal"
            labelClassName="text-xs text-muted-foreground"
            keyboardType="numeric"
            inputMode="decimal"
            value={valores.kcal}
            onChangeText={definir('kcal')}
          />
        </View>
        <View className="flex-1">
          <DrawerInput
            label="P (g)"
            labelClassName="text-xs text-muted-foreground"
            keyboardType="numeric"
            inputMode="decimal"
            value={valores.proteinG}
            onChangeText={definir('proteinG')}
          />
        </View>
        <View className="flex-1">
          <DrawerInput
            label="C (g)"
            labelClassName="text-xs text-muted-foreground"
            keyboardType="numeric"
            inputMode="decimal"
            value={valores.carbsG}
            onChangeText={definir('carbsG')}
          />
        </View>
        <View className="flex-1">
          <DrawerInput
            label="G (g)"
            labelClassName="text-xs text-muted-foreground"
            keyboardType="numeric"
            inputMode="decimal"
            value={valores.fatG}
            onChangeText={definir('fatG')}
          />
        </View>
      </View>

      {semKcal ? (
        <Text className="text-xs text-[#facc15]">
          Sem calorias informadas — o item será salvo, mas não afetará seu resumo de kcal.
        </Text>
      ) : null}

      {metasDeNutrientes.length > 0 ? (
        <View className="gap-2 rounded-lg border border-border bg-muted p-3">
          <Text className="text-xs font-bold text-muted-foreground">
            Metas personalizadas (opcional)
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {metasDeNutrientes.map((meta) => (
              <View key={meta.key} className="w-[31%]">
                <DrawerInput
                  label={`${meta.label} (${meta.unit})`}
                  labelClassName="text-[11px] font-medium text-muted-foreground"
                  keyboardType="numeric"
                  inputMode="decimal"
                  value={valoresDeNutrientes[meta.key] ?? ''}
                  onChangeText={(valor) => onNutrienteChange(meta.key, valor)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onBack}>
          Voltar
        </Button>
        <Button
          className="flex-1"
          onPress={onSubmit}
          disabled={!podeEnviar || enviando}
          loading={enviando}
        >
          Adicionar
        </Button>
      </View>
    </DrawerScrollView>
  );
}
