import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { nutritionApi, type NutrientTarget } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  cn,
} from '@/components/ui';
import { NUMEROS_TABULARES, mensagemDeErro } from '@/components/nutrition/helpers';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/nutrient-targets/page.tsx`.
 *
 * Mesmos presets, mesma regra de "pelo menos mín ou máx" e mesma opção de
 * nutriente livre. A remoção pede confirmação — no PWA o clique apaga a meta
 * direto, e aqui o alvo fica sob o polegar durante a rolagem.
 */

interface Preset {
  nutrientKey: string;
  label: string;
  unit: string;
  suggestMax?: number;
  suggestMin?: number;
}

const PRESETS: Preset[] = [
  { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', suggestMax: 2000 },
  { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', suggestMax: 50 },
  { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', suggestMin: 25 },
  { nutrientKey: 'saturated_fat_g', label: 'Gordura saturada', unit: 'g', suggestMax: 22 },
  { nutrientKey: 'caffeine_mg', label: 'Cafeína', unit: 'mg', suggestMax: 400 },
  { nutrientKey: 'cholesterol_mg', label: 'Colesterol', unit: 'mg', suggestMax: 300 },
  { nutrientKey: 'potassium_mg', label: 'Potássio', unit: 'mg', suggestMin: 3500 },
];

const CHAVE_LIVRE = '__custom__';

export default function NutrientTargetsScreen() {
  const qc = useQueryClient();
  const metas = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
  });

  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [rotuloLivre, setRotuloLivre] = useState('');
  const [chaveLivre, setChaveLivre] = useState('');
  const [unidadeLivre, setUnidadeLivre] = useState('mg');
  const [minimo, setMinimo] = useState('');
  const [maximo, setMaximo] = useState('');
  const eLivre = preset.nutrientKey === CHAVE_LIVRE;

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-targets'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary'] });
  };

  const salvar = useMutation({
    mutationFn: () => {
      const base = eLivre
        ? { nutrientKey: chaveLivre.trim(), label: rotuloLivre.trim(), unit: unidadeLivre.trim() }
        : { nutrientKey: preset.nutrientKey, label: preset.label, unit: preset.unit };
      return nutritionApi.upsertNutrientTarget({
        ...base,
        min: minimo.trim() ? Number(minimo) : undefined,
        max: maximo.trim() ? Number(maximo) : undefined,
      });
    },
    onSuccess: () => {
      invalidar();
      setMinimo('');
      setMaximo('');
      setRotuloLivre('');
      setChaveLivre('');
    },
  });

  const remover = useMutation({
    mutationFn: (chave: string) => nutritionApi.deleteNutrientTarget(chave),
    onSuccess: invalidar,
  });

  const chavesExistentes = useMemo(
    () => new Set((metas.data ?? []).map((meta) => meta.nutrientKey)),
    [metas.data],
  );

  const podeSalvar = eLivre
    ? Boolean(
        rotuloLivre.trim() &&
        chaveLivre.trim() &&
        unidadeLivre.trim() &&
        (minimo.trim() || maximo.trim()),
      )
    : Boolean(minimo.trim() || maximo.trim());

  const confirmarRemocao = (meta: NutrientTarget) =>
    Alert.alert('Remover meta', `A meta de ${meta.label} será apagada.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => remover.mutate(meta.nutrientKey) },
    ]);

  return (
    <Screen
      back
      title="Metas personalizadas"
      onRefresh={() => void metas.refetch()}
      refreshing={metas.isRefetching}
    >
      <View className="gap-5 p-4">
        <Text className="text-sm text-muted-foreground">
          Controle nutrientes além dos macros — sódio, açúcar, fibra... Defina um limite (máx) e/ou
          uma meta (mín). O valor do dia soma o que você registra nas refeições.
        </Text>

        {metas.isLoading ? <LoadingState label="Carregando metas…" /> : null}
        {metas.error ? (
          <ErrorState error={metas.error} onRetry={() => void metas.refetch()} />
        ) : null}

        {remover.error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {mensagemDeErro(remover.error, {
              alternativa: 'Não foi possível remover a meta. Tente de novo.',
            })}
          </Text>
        ) : null}

        {metas.data ? (
          <View className="gap-2">
            {metas.data.map((meta) => (
              <LinhaDaMeta key={meta.id} meta={meta} onRemover={() => confirmarRemocao(meta)} />
            ))}
            {metas.data.length === 0 ? (
              <EmptyState
                title="Nenhuma meta personalizada ainda."
                description="Escolha um nutriente abaixo para começar."
              />
            ) : null}
          </View>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Adicionar meta</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="flex-row flex-wrap gap-1.5">
              {PRESETS.map((opcao) => {
                const jaExiste = chavesExistentes.has(opcao.nutrientKey);
                const ativo = preset.nutrientKey === opcao.nutrientKey;
                return (
                  <Pressable
                    key={opcao.nutrientKey}
                    accessibilityRole="button"
                    accessibilityLabel={opcao.label}
                    accessibilityState={{ selected: ativo, disabled: jaExiste }}
                    disabled={jaExiste}
                    onPress={() => {
                      setPreset(opcao);
                      setMinimo(opcao.suggestMin ? String(opcao.suggestMin) : '');
                      setMaximo(opcao.suggestMax ? String(opcao.suggestMax) : '');
                    }}
                    className={cn(
                      'min-h-[44px] justify-center rounded-full px-3 py-1',
                      ativo ? 'bg-primary' : 'bg-muted',
                      jaExiste && 'opacity-30',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-xs font-bold',
                        ativo ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {opcao.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Outro nutriente"
                accessibilityState={{ selected: eLivre }}
                onPress={() => setPreset({ nutrientKey: CHAVE_LIVRE, label: '', unit: 'mg' })}
                className={cn(
                  'min-h-[44px] justify-center rounded-full px-3 py-1',
                  eLivre ? 'bg-primary' : 'bg-muted',
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-bold',
                    eLivre ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  Outro
                </Text>
              </Pressable>
            </View>

            {eLivre ? (
              <View className="flex-row gap-2">
                <Campo
                  rotulo="Nome"
                  valor={rotuloLivre}
                  onChange={setRotuloLivre}
                  placeholder="Ômega-3"
                />
                <Campo
                  rotulo="Chave"
                  valor={chaveLivre}
                  onChange={setChaveLivre}
                  placeholder="omega3_g"
                  autoCapitalize="none"
                />
                <Campo
                  rotulo="Unidade"
                  valor={unidadeLivre}
                  onChange={setUnidadeLivre}
                  placeholder="g"
                  autoCapitalize="none"
                />
              </View>
            ) : null}

            <View className="flex-row gap-2">
              <Campo
                rotulo={eLivre ? 'Mínimo' : `Mínimo (${preset.unit})`}
                valor={minimo}
                onChange={setMinimo}
                placeholder="—"
                numerico
              />
              <Campo
                rotulo={eLivre ? 'Máximo' : `Máximo (${preset.unit})`}
                valor={maximo}
                onChange={setMaximo}
                placeholder="—"
                numerico
              />
            </View>

            <Button
              onPress={() => salvar.mutate()}
              disabled={!podeSalvar || salvar.isPending}
              loading={salvar.isPending}
            >
              <Plus size={16} color="#131313" />
              <Text className="text-sm font-medium text-primary-foreground">Salvar meta</Text>
            </Button>

            {salvar.error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {mensagemDeErro(salvar.error, {
                  conflito: 'Essa meta já existe.',
                  alternativa: 'Não foi possível salvar a meta. Tente de novo.',
                })}
              </Text>
            ) : null}
          </CardContent>
        </Card>
      </View>
    </Screen>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  placeholder,
  numerico = false,
  autoCapitalize,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  numerico?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View className="flex-1 gap-1">
      <Label>{rotulo}</Label>
      <Input
        accessibilityLabel={rotulo}
        value={valor}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        keyboardType={numerico ? 'numeric' : 'default'}
        inputMode={numerico ? 'numeric' : 'text'}
      />
    </View>
  );
}

function LinhaDaMeta({ meta, onRemover }: { meta: NutrientTarget; onRemover: () => void }) {
  const faixa =
    meta.min != null && meta.max != null
      ? `${meta.min}–${meta.max} ${meta.unit}`
      : meta.max != null
        ? `máx ${meta.max} ${meta.unit}`
        : meta.min != null
          ? `mín ${meta.min} ${meta.unit}`
          : '—';

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground">{meta.label}</Text>
        <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          {faixa}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover ${meta.label}`}
        onPress={onRemover}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
      >
        <Trash2 size={16} color="#baccaf" />
      </Pressable>
    </View>
  );
}
