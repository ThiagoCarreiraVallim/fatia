import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star } from 'lucide-react-native';
import {
  amountGrams,
  amountPayload,
  initialAmount,
  nutritionApi,
  shortcutDetail,
  shortcutRows,
  withFavorite,
  type Amount,
  type Food,
  type FoodPortion,
  type FoodShortcut,
  type FoodShortcuts,
  type MealType,
  type ShortcutRow,
} from '@fatia/api-client';
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
  instanteNoDia,
  mensagemDeErro,
  parseNaoNegativo,
  parsePositivo,
  previaDoAlimento,
} from './helpers';
import { SeletorDeQuantidade } from './seletor-de-quantidade';

/**
 * Réplica de `apps/web/src/components/nutrition/food-search-drawer.tsx`.
 *
 * É o drawer mais usado do produto, e o teste do PWA
 * (`__tests__/food-search-drawer.test.tsx`) fixa o comportamento que precisa
 * sobreviver ao porte: busca com atraso de 300 ms, troca para o formulário
 * manual, criar refeição nova quando não há `mealId`, adicionar item quando há,
 * botão bloqueado com nome vazio e erro de busca com botão de tentar de novo.
 *
 * Atalhos (favoritos e recentes), estrela e vários itens por abertura seguem o
 * PWA; a lógica comum mora em `@fatia/api-client/food-shortcuts`.
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

const QUANTIDADE_INICIAL: Amount = { kind: 'grams', grams: '100' };

const MANUAL_INICIAL = { name: '', grams: '100', kcal: '', proteinG: '', carbsG: '', fatG: '' };
type ValoresManuais = typeof MANUAL_INICIAL;

export function FoodSearchDrawer({ open, onOpenChange, mealId, mealType, date }: Props) {
  const [modo, setModo] = useState<Modo>('busca');
  const [busca, setBusca] = useState('');
  const [buscaComAtraso, setBuscaComAtraso] = useState('');
  const [selecionado, setSelecionado] = useState<Food | null>(null);
  const [quantidade, setQuantidade] = useState<Amount>(QUANTIDADE_INICIAL);
  // As medidas do alimento escolhido, mais as que a pessoa criar sem fechar o drawer.
  const [medidas, setMedidas] = useState<FoodPortion[]>([]);
  const [manual, setManual] = useState<ValoresManuais>(MANUAL_INICIAL);
  const [nutrientesManuais, setNutrientesManuais] = useState<Record<string, string>>({});
  // Vários itens por abertura: o primeiro cria a refeição, os seguintes entram nela.
  const [refeicaoCriada, setRefeicaoCriada] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<string[]>([]);
  const qc = useQueryClient();
  const refeicaoAlvo = mealId ?? refeicaoCriada;

  // Metas de nutrientes ativas: o item manual pode informá-las (ADR 009).
  const metas = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
    enabled: open,
  });

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências, então a limpeza acontece no mesmo fechamento
  // — só que antes de pintar. Não há passagem de montagem porque cada `useState`
  // acima já parte destes mesmos valores: no efeito, a rodada de montagem era um
  // no-op.
  const [estavaAberto, setEstavaAberto] = useState(open);
  if (estavaAberto !== open) {
    setEstavaAberto(open);
    if (!open) {
      setModo('busca');
      setBusca('');
      setBuscaComAtraso('');
      setSelecionado(null);
      setQuantidade(QUANTIDADE_INICIAL);
      setMedidas([]);
      setManual(MANUAL_INICIAL);
      setNutrientesManuais({});
      setRefeicaoCriada(null);
      setAdicionados([]);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setBuscaComAtraso(busca), 300);
    return () => clearTimeout(id);
  }, [busca]);

  const resultados = useQuery({
    queryKey: ['nutrition', 'search', buscaComAtraso],
    queryFn: () => nutritionApi.searchFoods(buscaComAtraso, 20),
    enabled: open && modo === 'busca' && buscaComAtraso.trim().length >= 2,
  });

  const chaveDosAtalhos = ['nutrition', 'my-foods', mealType ?? null] as const;
  const atalhos = useQuery({
    queryKey: chaveDosAtalhos,
    queryFn: () => nutritionApi.myFoods(mealType),
    enabled: open,
  });
  const favoritos = useMemo(
    () => new Set((atalhos.data?.favorites ?? []).map((f) => f.id)),
    [atalhos.data],
  );

  // Otimista: a estrela responde no toque, e o servidor confirma depois.
  const favoritar = useMutation<void, Error, { food: Food; favorite: boolean }>({
    mutationFn: ({ food, favorite }) => nutritionApi.setFavorite(food.id, favorite),
    onMutate: ({ food, favorite }) => {
      qc.setQueryData<FoodShortcuts>(chaveDosAtalhos, (anterior) =>
        withFavorite(anterior, food, favorite),
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] }),
  });
  const alternarFavorito = (food: Food) =>
    favoritar.mutate({ food, favorite: !favoritos.has(food.id) });

  const adicionar = useMutation<unknown, Error, ItemDaRefeicao & { rotulo: string }>({
    mutationFn: ({ rotulo: _rotulo, ...payload }) => {
      if (refeicaoAlvo) return nutritionApi.addItem(refeicaoAlvo, payload);
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: instanteNoDia(date),
        items: [payload],
      });
    },
    onSuccess: (resultado, { rotulo }) => {
      if (!refeicaoAlvo) {
        const id = (resultado as { id?: string } | undefined)?.id;
        if (id) setRefeicaoCriada(id);
      }
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      setAdicionados((anteriores) => [...anteriores, rotulo]);
      // De volta aos atalhos, pronto para o próximo item.
      setModo('busca');
      setSelecionado(null);
      setBusca('');
      setBuscaComAtraso('');
      setQuantidade(QUANTIDADE_INICIAL);
      setMedidas([]);
      setManual(MANUAL_INICIAL);
      setNutrientesManuais({});
    },
  });

  const escolher = (food: Food | FoodShortcut) => {
    adicionar.reset();
    setSelecionado(food);
    setMedidas(food.portions ?? []);
    setQuantidade(initialAmount(food));
  };

  const criarMedida = async (rotulo: string, g: number) => {
    if (!selecionado) throw new Error('Sem alimento');
    const criada = await nutritionApi.createPortion(selecionado.id, { label: rotulo, grams: g });
    setMedidas((anteriores) => [...anteriores, criada]);
    // Busca e atalhos guardaram o alimento sem a medida nova.
    void qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    return criada;
  };

  const gramas = selecionado ? amountGrams(quantidade, medidas) : null;

  const erro = adicionar.error
    ? mensagemDeErro(adicionar.error, {
        conflito: refeicaoAlvo
          ? 'Esse item já foi registrado nessa refeição.'
          : 'Essa refeição já foi registrada.',
        alternativa: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;

  const enviarDaBusca = () => {
    if (!selecionado || gramas === null) return;
    adicionar.mutate({
      foodId: selecionado.id,
      ...amountPayload(quantidade),
      rotulo: selecionado.name,
    });
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
      rotulo: nome,
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
              : 'Toque num atalho ou busque. Dá para adicionar vários.'}
          </DrawerDescription>
        </DrawerHeader>

        {adicionados.length > 0 ? (
          <View
            accessibilityRole="summary"
            accessibilityLiveRegion="polite"
            className="mx-4 flex-row items-center gap-2 rounded-lg bg-primary/10 px-3 py-2"
          >
            <Check size={16} color="#2ce500" />
            <Text className="flex-1 text-sm text-primary">
              {`${adicionados[adicionados.length - 1]} adicionado`}
            </Text>
          </View>
        ) : null}

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
            favorito={favoritos.has(selecionado.id)}
            onAlternarFavorito={() => alternarFavorito(selecionado)}
            gramas={gramas}
            seletor={
              <SeletorDeQuantidade
                medidas={medidas}
                quantidade={quantidade}
                onChange={setQuantidade}
                onCriarMedida={criarMedida}
              />
            }
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
            atalhos={atalhos.data}
            favoritos={favoritos}
            onAlternarFavorito={alternarFavorito}
            onEscolher={escolher}
            onManual={() => {
              adicionar.reset();
              setModo('manual');
            }}
          />
        )}

        <DrawerFooter className="pb-6">
          {adicionados.length > 0 ? (
            <Button onPress={() => onOpenChange(false)}>
              {`Concluir · ${adicionados.length} ${adicionados.length === 1 ? 'item' : 'itens'}`}
            </Button>
          ) : (
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
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
  atalhos,
  favoritos,
  onAlternarFavorito,
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
  atalhos: FoodShortcuts | undefined;
  favoritos: ReadonlySet<number>;
  onAlternarFavorito: (food: Food) => void;
  onEscolher: (food: Food | FoodShortcut) => void;
  onManual: () => void;
}) {
  const digitando = buscaComAtraso.trim().length >= 2;
  // Sem termo, a lista mostra os atalhos; com termo, os resultados da busca.
  const linhas: ShortcutRow[] = digitando
    ? (dados ?? []).map((food) => ({
        kind: 'food',
        food: { ...food, lastGrams: null, timesEaten: 0, favorite: favoritos.has(food.id) },
      }))
    : shortcutRows(atalhos);

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
        data={linhas}
        keyExtractor={(linha: ShortcutRow) =>
          linha.kind === 'header'
            ? `titulo-${linha.title}`
            : linha.kind === 'template'
              ? `modelo-${linha.template.id}`
              : String(linha.food.id)
        }
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
          ) : !digitando ? (
            <Text className="px-4 py-3 text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres. O que você registrar aparece aqui, a um toque.
            </Text>
          ) : (
            <Text className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado.</Text>
          )
        }
        renderItem={({ item: linha }: { item: ShortcutRow }) =>
          linha.kind === 'header' ? (
            <Text
              accessibilityRole="header"
              className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {linha.title}
            </Text>
          ) : linha.kind === 'template' ? null : (
            <LinhaDeAlimento
              food={linha.food}
              detalhe={
                digitando
                  ? `${Math.round(linha.food.kcalPer100g)} kcal/100g · P${Math.round(linha.food.proteinPer100g)} · C${Math.round(linha.food.carbsPer100g)} · G${Math.round(linha.food.fatPer100g)}`
                  : shortcutDetail(linha.food)
              }
              favorito={favoritos.has(linha.food.id)}
              onEscolher={() => onEscolher(linha.food)}
              onAlternarFavorito={() => onAlternarFavorito(linha.food)}
            />
          )
        }
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

/** Escolher e favoritar são alvos separados, cada um com 44 pt de toque. */
function LinhaDeAlimento({
  food,
  detalhe,
  favorito,
  onEscolher,
  onAlternarFavorito,
}: {
  food: Food;
  detalhe: string;
  favorito: boolean;
  onEscolher: () => void;
  onAlternarFavorito: () => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center border-b border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${detalhe}`}
        onPress={onEscolher}
        className="flex-1 flex-row items-center py-3 pl-4 active:bg-accent"
      >
        <View className="flex-1 pr-2">
          <Text className="text-sm font-medium text-foreground">{food.name}</Text>
          <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
            {detalhe}
          </Text>
        </View>
        {food.source === 'CUSTOM' ? (
          <Text className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
            Meu
          </Text>
        ) : null}
      </Pressable>
      <BotaoFavorito nome={food.name} favorito={favorito} onPress={onAlternarFavorito} />
    </View>
  );
}

function BotaoFavorito({
  nome,
  favorito,
  onPress,
}: {
  nome: string;
  favorito: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${favorito ? 'Desfavoritar' : 'Favoritar'} ${nome}`}
      accessibilityState={{ selected: favorito }}
      onPress={onPress}
      hitSlop={4}
      className="h-12 w-12 items-center justify-center"
    >
      <Star
        size={18}
        color={favorito ? '#fbbf24' : '#8a8a8a'}
        fill={favorito ? '#fbbf24' : 'transparent'}
      />
    </Pressable>
  );
}

function PainelDoAlimento({
  food,
  favorito,
  onAlternarFavorito,
  gramas,
  seletor,
  onBack,
  onSubmit,
  enviando,
  erro,
}: {
  food: Food;
  favorito: boolean;
  onAlternarFavorito: () => void;
  /** Gramas que vão ser gravadas (digitadas ou da medida); `null` se ainda não dá. */
  gramas: number | null;
  seletor: React.ReactNode;
  onBack: () => void;
  onSubmit: () => void;
  enviando: boolean;
  erro: string | undefined;
}) {
  const previa = gramas !== null ? previaDoAlimento(food, String(gramas)) : null;
  const podeEnviar = gramas !== null;

  return (
    <View className="flex-1 gap-4 px-4 py-3">
      <View className="flex-row items-center rounded-lg border border-border pl-3">
        <View className="flex-1 py-3">
          <Text className="text-sm font-medium text-foreground">{food.name}</Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(food.kcalPer100g)} kcal/100g
          </Text>
        </View>
        <BotaoFavorito nome={food.name} favorito={favorito} onPress={onAlternarFavorito} />
      </View>

      {seletor}

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
