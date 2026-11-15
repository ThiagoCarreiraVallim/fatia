import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Camera,
  Check,
  ChevronLeft,
  Mic,
  Plus,
  ScanLine,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  addTargetLabel,
  aiLock,
  mealForLabel,
  planHref,
  amountGrams,
  amountPayload,
  emptyCustomFoodForm,
  emptySearchCopy,
  foodAmountPreview,
  foodOriginTag,
  initialAmount,
  isSearching,
  nutritionApi,
  resultsCaption,
  shortcutLine,
  templateSummary,
  withFavorite,
  type Amount,
  type CustomFoodForm as CustomFoodValues,
  type CustomFoodInput,
  type Food,
  type FoodPortion,
  type FoodShortcut,
  type FoodShortcuts,
  type MealTemplate,
  type MealType,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFlatList,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  cn,
  useConfirm,
} from '@/components/ui';
import { HeaderButton } from '@/components/layout/tab-header';
import { useAiMenu } from '@/components/layout/ai-menu';
import { DrawerInput } from './drawer-input';
import {
  NUMEROS_TABULARES,
  instanteNoDia,
  mensagemDeErro,
  parseNaoNegativo,
  parsePositivo,
} from './helpers';
import { CustomFoodForm } from './custom-food-form';
import { AmountPicker } from './amount-picker';
import { colors } from '@/theme/colors';

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

const MEAL_TYPES: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];
const MEAL_CHIP_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Café',
  LUNCH: 'Almoço',
  SNACK: 'Lanche',
  DINNER: 'Jantar',
};

type ItemDaRefeicao = Parameters<typeof nutritionApi.addItem>[1];
type Modo = 'busca' | 'manual' | 'criar';
type BrowseTab = 'recent' | 'favorites' | 'templates' | 'mine';

/** A lista do painel de busca: alimentos (atalhos, resultados) ou refeições salvas. */
type Row =
  { kind: 'food'; food: Food | FoodShortcut } | { kind: 'template'; template: MealTemplate };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com `mealId`, adiciona item à refeição. Sem ele, cria uma refeição nova. */
  mealId?: string;
  mealType?: MealType;
  date: string;
  /**
   * Alimento da pessoa achado pelo código de barras: o drawer abre direto na
   * quantidade e o item entra com origem BARCODE.
   */
  initialFood?: Food;
}

const QUANTIDADE_INICIAL: Amount = { kind: 'grams', grams: '100' };

const MANUAL_INICIAL = { name: '', grams: '100', kcal: '', proteinG: '', carbsG: '', fatG: '' };
type ValoresManuais = typeof MANUAL_INICIAL;

export function FoodSearchDrawer({
  open,
  onOpenChange,
  mealId,
  mealType: mealTypeProp,
  date,
  initialFood,
}: Props) {
  // "Para" (prancha Al-N15): a pessoa troca a refeição antes do primeiro item.
  const [chosenType, setChosenType] = useState<MealType | null>(null);
  const mealType = chosenType ?? mealTypeProp;
  const confirm = useConfirm();
  const aiMenu = useAiMenu();
  const [modo, setModo] = useState<Modo>('busca');
  const [busca, setBusca] = useState('');
  const [buscaComAtraso, setBuscaComAtraso] = useState('');
  const [selecionado, setSelecionado] = useState<Food | null>(null);
  const [quantidade, setQuantidade] = useState<Amount>(QUANTIDADE_INICIAL);
  // As medidas do alimento escolhido, mais as que a pessoa criar sem fechar o drawer.
  const [medidas, setMedidas] = useState<FoodPortion[]>([]);
  const [manual, setManual] = useState<ValoresManuais>(MANUAL_INICIAL);
  // O formulário de alimento próprio já preenchido (o nome que a busca tinha).
  const [createInitial, setCreateInitial] = useState<CustomFoodValues>(() => emptyCustomFoodForm());
  const [pickedByBarcode, setPickedByBarcode] = useState(false);
  const [savedOnly, setSavedOnly] = useState<string | null>(null);
  const [nutrientesManuais, setNutrientesManuais] = useState<Record<string, string>>({});
  // Vários itens por abertura: o primeiro cria a refeição, os seguintes entram nela.
  const [refeicaoCriada, setRefeicaoCriada] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<string[]>([]);
  const qc = useQueryClient();
  const router = useRouter();
  const refeicaoAlvo = mealId ?? refeicaoCriada;

  // O scanner é uma tela (precisa da câmera inteira). Leva o dia, o tipo e a
  // refeição já criada nesta abertura, para o produto cair no mesmo lugar.
  const lerCodigo = () => {
    onOpenChange(false);
    router.push({
      pathname: '/nutrition/scan',
      params: {
        date,
        ...(mealType ? { mealType } : {}),
        ...(refeicaoAlvo ? { mealId: refeicaoAlvo } : {}),
      },
    });
  };

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
  const [seenInitial, setSeenInitial] = useState<Food | undefined>(undefined);
  if (open && initialFood && seenInitial !== initialFood) {
    // Do leitor: o alimento seu, vinculado ao código, já na quantidade.
    setSeenInitial(initialFood);
    setSelecionado(initialFood);
    setMedidas(initialFood.portions ?? []);
    setQuantidade(initialAmount(initialFood));
    setPickedByBarcode(true);
  }
  if (estavaAberto !== open) {
    setEstavaAberto(open);
    if (!open) {
      setSeenInitial(undefined);
      setPickedByBarcode(false);
      setSavedOnly(null);
      setModo('busca');
      setBusca('');
      setBuscaComAtraso('');
      setSelecionado(null);
      setQuantidade(QUANTIDADE_INICIAL);
      setMedidas([]);
      setManual(MANUAL_INICIAL);
      setCreateInitial(emptyCustomFoodForm());
      setNutrientesManuais({});
      setRefeicaoCriada(null);
      setAdicionados([]);
      setChosenType(null);
    }
  }

  // Foto do prato (Al-N15): só com IA de visão no servidor; no Free, leva ao plano.
  const photoStatus = useQuery({
    queryKey: ['nutrition', 'photo-recognition'],
    queryFn: () => nutritionApi.photoRecognitionStatus(),
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: open,
  });
  const photoLock = aiLock(photoStatus.data);

  useEffect(() => {
    const id = setTimeout(() => setBuscaComAtraso(busca), 300);
    return () => clearTimeout(id);
  }, [busca]);

  const resultados = useQuery({
    queryKey: ['nutrition', 'search', buscaComAtraso],
    queryFn: () => nutritionApi.searchFoods(buscaComAtraso, 20),
    enabled: open && modo === 'busca' && isSearching(buscaComAtraso),
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

  const meusAlimentos = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
    enabled: open,
  });

  // Refeição salva registra a refeição inteira: só faz sentido ao criar uma nova.
  const modelos = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
    enabled: open && !mealId,
  });

  const registrarModelo = useMutation<unknown, Error, MealTemplate>({
    mutationFn: (modelo) =>
      nutritionApi.logMealTemplate(modelo.id, { eatenAt: instanteNoDia(date), mealType }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      // O card de macros do dashboard: a refeição pode vir do "+", fora da Nutrição.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
  });

  const apagarModelo = useMutation<void, Error, string>({
    mutationFn: (id) => nutritionApi.deleteMealTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] }),
  });

  const confirmarApagarModelo = (modelo: MealTemplate) => {
    confirm({
      title: 'Apagar refeição salva',
      description: `"${modelo.name}" sai da lista. O que já foi registrado fica.`,
      confirmLabel: 'Apagar',
      destructive: true,
      onConfirm: () => apagarModelo.mutate(modelo.id),
    });
  };

  const erroDoModelo = registrarModelo.error ?? apagarModelo.error;

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
      // O card de macros do dashboard: a refeição pode vir do "+", fora da Nutrição.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setAdicionados((anteriores) => [...anteriores, rotulo]);
      // De volta aos atalhos, pronto para o próximo item.
      setModo('busca');
      setSelecionado(null);
      setPickedByBarcode(false);
      setSavedOnly(null);
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
    setSavedOnly(null);
    setPickedByBarcode(false);
    setSelecionado(food);
    setMedidas(food.portions ?? []);
    setQuantidade(initialAmount(food));
  };

  // "Salvar e registrar" cai na quantidade; "Só salvar" guarda e volta à busca.
  const criarAlimento = useMutation<Food, Error, { input: CustomFoodInput; register: boolean }>({
    mutationFn: ({ input }) => nutritionApi.createCustomFood(input),
    onSuccess: (food, { register }) => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
      setModo('busca');
      if (register) escolher(food);
      else setSavedOnly(food.name);
    },
  });

  const comecarCadastro = (nome: string) => {
    adicionar.reset();
    criarAlimento.reset();
    setSavedOnly(null);
    setCreateInitial(emptyCustomFoodForm(nome));
    setModo('criar');
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
      ...(pickedByBarcode ? { source: 'BARCODE' as const } : {}),
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
  const browsing = modo === 'busca' && !selecionado;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <View className="flex-1 bg-background">
        {browsing ? (
          // Cabeçalho da busca (prancha Al-N15): fechar, "Adicionar" e quantos
          // itens já entraram.
          <View className="flex-row items-center gap-3 px-4 pb-2 pt-1">
            <HeaderButton label="Fechar" onPress={() => onOpenChange(false)}>
              <X size={20} color={colors.foreground} />
            </HeaderButton>
            <Text
              accessibilityRole="header"
              className="flex-1 text-center font-sans-bold text-[15px]"
            >
              {mealId ? 'Adicionar item' : 'Adicionar'}
            </Text>
            <View
              accessibilityLabel={`${adicionados.length} ${adicionados.length === 1 ? 'item adicionado' : 'itens adicionados'}`}
              className={cn(
                'h-[22px] min-w-11 items-center justify-center rounded-pill px-2.5',
                adicionados.length > 0 ? 'bg-primary' : 'bg-surface-3',
              )}
            >
              <Text
                style={NUMEROS_TABULARES}
                className={cn(
                  'font-sans-extrabold text-[11px]',
                  adicionados.length > 0 ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {adicionados.length}
              </Text>
            </View>
          </View>
        ) : modo === 'criar' ? (
          // Novo alimento (prancha Al-N11): o "x" volta para a busca.
          <View className="flex-row items-center gap-3 px-4 pb-2 pt-1">
            <HeaderButton label="Voltar para a busca" onPress={() => setModo('busca')}>
              <X size={20} color={colors.foreground} />
            </HeaderButton>
            <Text
              accessibilityRole="header"
              className="flex-1 pr-14 text-center font-sans-bold text-[15px]"
            >
              Novo alimento
            </Text>
          </View>
        ) : selecionado && modo === 'busca' ? null : (
          <DrawerHeader>
            <DrawerTitle>{titulo}</DrawerTitle>
            <DrawerDescription>Só para esta refeição: informe nome e macros.</DrawerDescription>
          </DrawerHeader>
        )}

        {browsing && !mealId && refeicaoCriada === null ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel="Para qual refeição"
            className="grow-0"
            contentContainerClassName="items-center gap-1.5 px-4 pb-1"
          >
            <Text className="w-9 text-xs text-muted-foreground">Para</Text>
            {MEAL_TYPES.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: mealType === t }}
                onPress={() => setChosenType(t)}
                className={cn(
                  'h-9 justify-center rounded-chip px-3.5',
                  mealType === t ? 'bg-foreground' : 'bg-card',
                )}
              >
                <Text
                  className={cn(
                    'font-sans-semibold text-sm',
                    mealType === t ? 'text-background' : 'text-muted-foreground',
                  )}
                >
                  {MEAL_CHIP_LABEL[t]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {savedOnly && adicionados.length === 0 ? (
          <View
            accessibilityRole="summary"
            accessibilityLiveRegion="polite"
            className="mx-4 flex-row items-center gap-2 rounded-lg bg-primary/10 px-3 py-2"
          >
            <Check size={16} color={colors.primaryText} />
            <Text className="flex-1 text-sm text-primary">
              {`${savedOnly} salvo em Meus alimentos`}
            </Text>
          </View>
        ) : null}

        {adicionados.length > 0 ? (
          <View
            accessibilityRole="summary"
            accessibilityLiveRegion="polite"
            className="mx-4 flex-row items-center gap-2 rounded-lg bg-primary/10 px-3 py-2"
          >
            <Check size={16} color={colors.primaryText} />
            <Text className="flex-1 text-sm text-primary">
              {`${adicionados[adicionados.length - 1]} adicionado`}
            </Text>
          </View>
        ) : null}

        {modo === 'criar' ? (
          <CustomFoodForm
            initial={createInitial}
            submitLabel="Salvar e registrar"
            pending={criarAlimento.isPending}
            error={
              criarAlimento.error
                ? mensagemDeErro(criarAlimento.error, { conflito: criarAlimento.error.message })
                : undefined
            }
            onSubmit={(input) => criarAlimento.mutate({ input, register: true })}
            saveOnly={{
              label: 'Só salvar',
              onSubmit: (input) => criarAlimento.mutate({ input, register: false }),
            }}
            onCancel={() => setModo('busca')}
          />
        ) : modo === 'manual' ? (
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
          <SelectedFoodPanel
            food={selecionado}
            submitLabel={addTargetLabel(mealType)}
            forLabel={mealForLabel(mealType)}
            favorito={favoritos.has(selecionado.id)}
            onAlternarFavorito={() => alternarFavorito(selecionado)}
            gramas={gramas}
            seletor={
              <AmountPicker
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
          <SearchPanel
            busca={busca}
            onBuscaChange={setBusca}
            buscaComAtraso={buscaComAtraso}
            buscando={resultados.isFetching}
            comErro={resultados.isError}
            onRetry={() => void resultados.refetch()}
            dados={resultados.data}
            atalhos={atalhos.data}
            meusAlimentos={meusAlimentos.data ?? []}
            modelos={mealId ? [] : (modelos.data ?? [])}
            onRegistrarModelo={(modelo) => registrarModelo.mutate(modelo)}
            onApagarModelo={confirmarApagarModelo}
            erroDoModelo={erroDoModelo ? mensagemDeErro(erroDoModelo) : undefined}
            onEscolher={escolher}
            onManual={() => {
              adicionar.reset();
              setModo('manual');
            }}
            onCriar={comecarCadastro}
            onLerCodigo={lerCodigo}
            photo={
              photoLock === 'hidden'
                ? undefined
                : () => {
                    onOpenChange(false);
                    router.push(
                      photoLock === 'locked' ? planHref('foto') : `/nutrition/photo?date=${date}`,
                    );
                  }
            }
            onTalkToAi={() => {
              onOpenChange(false);
              aiMenu.open();
            }}
          />
        )}

        {browsing ? (
          // O fim da busca (prancha Al-N15): "Criar" e o concluir, que só acende
          // depois do primeiro item.
          <View className="flex-row items-center gap-2 px-4 pb-6 pt-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Criar"
              onPress={() => comecarCadastro(busca.trim())}
              className="h-14 flex-row items-center gap-2 rounded-pill bg-card px-[18px]"
            >
              <Plus size={16} color={colors.foreground} />
              <Text className="font-sans-bold text-[15px]">Criar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: adicionados.length === 0 }}
              disabled={adicionados.length === 0}
              onPress={() => onOpenChange(false)}
              className={cn(
                'h-14 flex-1 items-center justify-center rounded-pill',
                adicionados.length > 0 ? 'bg-primary' : 'bg-card',
              )}
            >
              <Text
                className={cn(
                  'font-sans-bold text-[15px]',
                  adicionados.length > 0 ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {adicionados.length > 0
                  ? `Concluir · ${adicionados.length} ${adicionados.length === 1 ? 'item' : 'itens'}`
                  : 'Selecione os itens'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Drawer>
  );
}

function SearchPanel({
  busca,
  onBuscaChange,
  buscaComAtraso,
  buscando,
  comErro,
  onRetry,
  dados,
  atalhos,
  meusAlimentos,
  modelos,
  onRegistrarModelo,
  onApagarModelo,
  erroDoModelo,
  onEscolher,
  onManual,
  onCriar,
  onLerCodigo,
  photo,
  onTalkToAi,
}: {
  busca: string;
  onBuscaChange: (valor: string) => void;
  buscaComAtraso: string;
  buscando: boolean;
  comErro: boolean;
  onRetry: () => void;
  dados: Food[] | undefined;
  atalhos: FoodShortcuts | undefined;
  meusAlimentos: Food[];
  modelos: MealTemplate[];
  onRegistrarModelo: (modelo: MealTemplate) => void;
  onApagarModelo: (modelo: MealTemplate) => void;
  erroDoModelo?: string;
  onEscolher: (food: Food | FoodShortcut) => void;
  onManual: () => void;
  onCriar: (nome: string) => void;
  onLerCodigo: () => void;
  /** Foto do prato; sem IA de visão no servidor, o botão não aparece. */
  photo?: () => void;
  /** Fecha a busca e abre o menu da IA (ditar a refeição). */
  onTalkToAi: () => void;
}) {
  const [focused, setFocused] = useState(true);
  const digitando = isSearching(buscaComAtraso);
  const [tab, setTab] = useState<BrowseTab>('recent');
  // Ao registrar numa refeição aberta, "Salvas" (a refeição inteira) não cabe.
  const tabs = [
    { value: 'recent' as const, label: 'Recentes' },
    { value: 'favorites' as const, label: 'Favoritos' },
    ...(modelos.length > 0 ? [{ value: 'templates' as const, label: 'Salvas' }] : []),
    { value: 'mine' as const, label: 'Meus' },
  ];
  const foodRows = (foods: Array<Food | FoodShortcut>): Row[] =>
    foods.map((food) => ({ kind: 'food', food }));
  // Sem termo, a lista mostra a aba; com termo, os resultados da busca.
  const linhas: Row[] = digitando
    ? foodRows(dados ?? [])
    : tab === 'recent'
      ? foodRows(atalhos?.recent ?? [])
      : tab === 'favorites'
        ? foodRows(atalhos?.favorites ?? [])
        : tab === 'mine'
          ? foodRows(meusAlimentos)
          : modelos.map((template) => ({ kind: 'template', template }));
  const emptyTab: Record<BrowseTab, string> = {
    recent: 'O que você registrar aparece aqui, a um toque.',
    favorites: 'Toque na estrela de um alimento para ele morar aqui.',
    templates: 'Nenhuma refeição salva.',
    mine: 'Seus alimentos aparecem aqui: o produto embalado, a receita de casa.',
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 px-4 pt-3">
        <View
          style={{ borderWidth: 1.5, borderColor: focused ? colors.primary : 'transparent' }}
          className="h-[52px] flex-1 flex-row items-center gap-2 rounded-pill bg-card px-4"
        >
          <Search size={16} color={colors.faintForeground} />
          <DrawerTextInput
            autoFocus
            accessibilityLabel="Buscar alimento"
            value={busca}
            onChangeText={onBuscaChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Arroz, frango, banana…"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primaryText}
            style={{ flex: 1, height: 48, fontSize: 16, color: colors.foreground }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ler código ou rótulo"
          onPress={onLerCodigo}
          className="h-[52px] w-[52px] items-center justify-center rounded-pill bg-muted active:opacity-70"
        >
          <ScanLine size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {!digitando ? (
        <>
          <View className="flex-row gap-2 px-4 pt-3.5">
            {photo ? (
              <Pressable
                accessibilityRole="button"
                onPress={photo}
                className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-card"
              >
                <Camera size={16} color={colors.foreground} />
                <Text className="font-sans-bold text-[13px]">Foto do prato</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onTalkToAi}
              className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-card"
            >
              <Mic size={16} color={colors.primaryText} />
              <Text className="font-sans-bold text-[13px]">Falar com a IA</Text>
            </Pressable>
          </View>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Atalhos"
            className="mx-4 mt-3.5 flex-row gap-5 border-b border-border"
          >
            {tabs.map((t) => (
              <Pressable
                key={t.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.value }}
                onPress={() => setTab(t.value)}
                style={
                  tab === t.value ? { borderBottomWidth: 2, borderColor: colors.primary } : null
                }
                className="h-10 justify-center"
              >
                <Text
                  className={cn(
                    'font-sans-bold text-sm',
                    tab === t.value ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View className="mx-4 mt-3.5 flex-1 overflow-hidden rounded-card bg-card">
        <DrawerFlatList
          style={{ flex: 1 }}
          data={linhas}
          keyExtractor={(linha: Row) =>
            linha.kind === 'template' ? `modelo-${linha.template.id}` : String(linha.food.id)
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            buscando ? (
              <Text className="px-4 py-3 text-sm text-muted-foreground">Buscando...</Text>
            ) : erroDoModelo && !digitando ? (
              <Text accessibilityRole="alert" className="px-4 py-3 text-sm text-destructive">
                {erroDoModelo}
              </Text>
            ) : digitando && !comErro && (dados?.length ?? 0) > 0 ? (
              <Text className="px-4 pb-1 text-xs text-muted-foreground">
                {resultsCaption(dados?.length ?? 0)}
              </Text>
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
              <Text className="px-4 py-3 text-sm text-muted-foreground">{emptyTab[tab]}</Text>
            ) : (
              <View className="items-start gap-2 px-4 py-3">
                <Text className="text-sm font-medium text-foreground">
                  {emptySearchCopy(buscaComAtraso).title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Produto embalado ou receita de casa? Cadastre uma vez e ele aparece aqui.
                </Text>
                <Button
                  variant="outline"
                  onPress={() => onCriar(buscaComAtraso.trim())}
                  accessibilityLabel={emptySearchCopy(buscaComAtraso).action}
                >
                  <View className="flex-row items-center gap-1">
                    <Plus size={14} color={colors.primaryText} />
                    <Text className="text-sm text-foreground">
                      {emptySearchCopy(buscaComAtraso).action}
                    </Text>
                  </View>
                </Button>
              </View>
            )
          }
          renderItem={({ item: linha }: { item: Row }) =>
            linha.kind === 'template' ? (
              <LinhaDeModelo
                modelo={linha.template}
                onRegistrar={() => onRegistrarModelo(linha.template)}
                onApagar={() => onApagarModelo(linha.template)}
              />
            ) : (
              <FoodRow
                food={linha.food}
                showOrigin={digitando}
                {...('lastGrams' in linha.food
                  ? shortcutLine(linha.food)
                  : {
                      detail: `100 g · P ${Math.round(linha.food.proteinPer100g)} · C ${Math.round(linha.food.carbsPer100g)} · G ${Math.round(linha.food.fatPer100g)}`,
                      kcal: linha.food.kcalPer100g,
                    })}
                onEscolher={() => onEscolher(linha.food)}
              />
            )
          }
        />
      </View>

      {/* Fora da prancha, mas não some: o item avulso, sem cadastrar alimento.
        O "Criar" fica no rodapé. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar só desta vez"
        onPress={onManual}
        className="min-h-[44px] items-center justify-center"
      >
        <Text className="font-sans-semibold text-sm text-primary">Registrar só desta vez</Text>
      </Pressable>
    </View>
  );
}

/** Escolher e favoritar são alvos separados, cada um com 44 pt de toque. */
/** Refeição salva: o toque registra tudo; apagar confirma antes. */
function LinhaDeModelo({
  modelo,
  onRegistrar,
  onApagar,
}: {
  modelo: MealTemplate;
  onRegistrar: () => void;
  onApagar: () => void;
}) {
  const resumo = templateSummary(modelo);
  return (
    <View className="min-h-[56px] flex-row items-center border-b border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${modelo.name}, ${resumo}`}
        onPress={onRegistrar}
        className="flex-1 py-3 pl-4 active:bg-accent"
      >
        <Text className="text-sm font-medium text-foreground">{modelo.name}</Text>
        <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          {resumo}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apagar ${modelo.name}`}
        onPress={onApagar}
        className="h-11 w-11 items-center justify-center"
      >
        <Trash2 size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

/** Linha da lista (prancha Al-N15): o toque abre a quantidade (Al-N3), onde fica a estrela. */
function FoodRow({
  food,
  detail,
  kcal,
  onEscolher,
  showOrigin = false,
}: {
  food: Food;
  /** Na busca, o selo de origem de cada linha (TACO, seu). */
  showOrigin?: boolean;
  detail: string;
  /** As calorias da porção de costume, à direita. */
  kcal: number;
  onEscolher: () => void;
}) {
  const origin = foodOriginTag(food);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${food.name}, ${detail}`}
      onPress={onEscolher}
      className="mx-4 min-h-[60px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
    >
      <View className="min-w-0 flex-1 gap-px">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink font-sans-semibold text-[15px] text-foreground">
            {food.name}
          </Text>
          {showOrigin || food.source === 'CUSTOM' ? (
            <View
              className={cn(
                'h-[18px] justify-center rounded-pill px-2',
                origin.tone === 'ok' ? 'bg-primary/15' : 'bg-muted',
              )}
            >
              <Text
                className={cn(
                  'font-sans-extrabold text-[11px] uppercase',
                  origin.tone === 'ok' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {origin.label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          {detail}
        </Text>
      </View>
      <Text style={NUMEROS_TABULARES} className="font-sans-bold text-sm">
        {Math.round(kcal)} <Text className="text-xs text-muted-foreground">kcal</Text>
      </Text>
    </Pressable>
  );
}

function SelectedFoodPanel({
  food,
  submitLabel,
  forLabel,
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
  /** "Adicionar ao jantar": diz para onde vai. */
  submitLabel: string;
  /** "para o jantar". */
  forLabel: string;
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
  const previa = foodAmountPreview(food, gramas);
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const podeEnviar = gramas !== null;
  const origin = foodOriginTag(food);
  const sub = [origin.tone === 'ok' ? 'seu alimento' : origin.label, forLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <DrawerScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-2">
      {/* Quantidade (prancha Al-N3): nome grande, de onde vem e para onde vai. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-xs text-muted-foreground">Quantidade</Text>
          <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
            {food.name}
          </Text>
          <Text className="text-xs text-muted-foreground">{sub}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${favorito ? 'Desfavoritar' : 'Favoritar'} ${food.name}`}
          accessibilityState={{ selected: favorito }}
          onPress={onAlternarFavorito}
          className="h-11 w-11 items-center justify-center rounded-pill bg-muted"
        >
          <Star
            size={20}
            color={favorito ? colors.warning : colors.foreground}
            fill={favorito ? colors.warning : 'transparent'}
          />
        </Pressable>
      </View>

      {seletor}

      {previa ? (
        <>
          <View className="flex-row gap-2">
            <MacroTile value={String(previa.kcal)} label="kcal" />
            <MacroTile value={fmt(previa.proteinG)} label="prot g" color={colors.protein} />
            <MacroTile value={fmt(previa.carbsG)} label="carb g" color={colors.carbs} />
            <MacroTile value={fmt(previa.fatG)} label="gord g" color={colors.fat} />
          </View>
          <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
            {`Fibra ${previa.fiberG === null ? '—' : `${fmt(previa.fiberG)} g`} · Sódio ${previa.sodiumMg === null ? '—' : `${previa.sodiumMg} mg`}`}
          </Text>
        </>
      ) : null}

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          className="h-14 w-14 items-center justify-center rounded-pill bg-muted"
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !podeEnviar || enviando }}
          disabled={!podeEnviar || enviando}
          onPress={onSubmit}
          className={cn(
            'h-14 flex-1 items-center justify-center rounded-pill bg-primary',
            (!podeEnviar || enviando) && 'opacity-40',
          )}
        >
          <Text className="font-sans-bold text-[15px] text-primary-foreground">
            {enviando ? 'Salvando...' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </DrawerScrollView>
  );
}

function MacroTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View className="flex-1 items-center gap-1 rounded-[16px] bg-muted px-1 py-2.5">
      <Text
        style={[NUMEROS_TABULARES, color ? { color } : null]}
        className="font-sans-bold text-lg"
      >
        {value}
      </Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
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
        <Text className="text-xs text-warning">
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
