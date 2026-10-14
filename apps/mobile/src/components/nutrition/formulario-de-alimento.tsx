import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  customFoodFromForm,
  customFoodSummary,
  type CustomFoodBasis,
  type CustomFoodErrors,
  type CustomFoodForm,
  type CustomFoodInput,
} from '@fatia/api-client';
import { Button, DrawerScrollView, cn } from '@/components/ui';
import { DrawerInput } from './drawer-input';

/**
 * Réplica de `apps/web/src/components/nutrition/custom-food-form.tsx`.
 *
 * Copia o rótulo como ele vem ("porção de 30 g"); a conta para 100 g é a de
 * `customFoodFromForm`, a mesma do PWA.
 */

const CAMPOS_DE_MACRO = [
  ['kcal', 'Calorias (kcal)'],
  ['protein', 'Proteína (g)'],
  ['carbs', 'Carboidrato (g)'],
  ['fat', 'Gordura (g)'],
] as const;

export function FormularioDeAlimento({
  inicial,
  editando = false,
  rotuloDoEnvio,
  enviando,
  erro,
  onEnviar,
  onCancelar,
  rotuloDoCancelar = 'Voltar',
  rodape,
}: {
  inicial: CustomFoodForm;
  /** Na edição os valores ficam por 100 g, como estão guardados. */
  editando?: boolean;
  rotuloDoEnvio: string;
  enviando: boolean;
  erro?: string;
  onEnviar: (input: CustomFoodInput) => void;
  onCancelar: () => void;
  rotuloDoCancelar?: string;
  /** O "Apagar alimento" da edição, dentro da mesma rolagem. */
  rodape?: ReactNode;
}) {
  const [valores, setValores] = useState(inicial);
  const [erros, setErros] = useState<CustomFoodErrors>({});

  const definir = (campo: keyof CustomFoodForm) => (valor: string) => {
    setValores((anterior) => ({ ...anterior, [campo]: valor }));
    setErros((anterior) => ({ ...anterior, [campo]: undefined, macros: undefined }));
  };
  const definirBase = (basis: CustomFoodBasis) => {
    setValores((anterior) => ({ ...anterior, basis }));
    setErros({});
  };

  const porPorcao = valores.basis === 'serving';
  // A conta à vista: quem copia o rótulo confere se a porção foi digitada certo.
  const conferido = porPorcao ? customFoodFromForm(valores) : null;

  const enviar = () => {
    const resultado = customFoodFromForm(valores);
    if (!resultado.ok) {
      setErros(resultado.errors);
      return;
    }
    onEnviar(resultado.input);
  };

  const erroDoCampo = (campo: keyof CustomFoodErrors) =>
    erros[campo] ? (
      <Text accessibilityRole="alert" className="text-xs text-destructive">
        {erros[campo]}
      </Text>
    ) : null;

  return (
    <DrawerScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <DrawerInput
          label="Nome"
          autoFocus={!inicial.name}
          value={valores.name}
          onChangeText={definir('name')}
          placeholder="Ex.: granola da marca X"
          maxLength={160}
        />
        {erroDoCampo('name')}
      </View>

      {editando ? null : (
        <View className="gap-1">
          <Text className="text-sm font-medium text-foreground">Valores do rótulo</Text>
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            <ChipDeBase marcado={porPorcao} onPress={() => definirBase('serving')}>
              Por porção
            </ChipDeBase>
            <ChipDeBase marcado={!porPorcao} onPress={() => definirBase('100g')}>
              Por 100 g
            </ChipDeBase>
          </View>
        </View>
      )}

      {porPorcao ? (
        <View className="gap-1">
          <DrawerInput
            label="Tamanho da porção (g)"
            keyboardType="numeric"
            inputMode="decimal"
            value={valores.servingGrams}
            onChangeText={definir('servingGrams')}
            placeholder="Ex.: 30"
          />
          {erroDoCampo('servingGrams')}
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {CAMPOS_DE_MACRO.map(([campo, rotulo]) => (
          <View key={campo} className="w-[48%] gap-1">
            <DrawerInput
              label={rotulo}
              labelClassName="text-xs text-muted-foreground"
              keyboardType="numeric"
              inputMode="decimal"
              value={valores[campo]}
              onChangeText={definir(campo)}
              placeholder={campo === 'kcal' ? '' : '0'}
            />
            {erroDoCampo(campo)}
          </View>
        ))}
      </View>
      {erroDoCampo('macros')}

      {conferido?.ok ? (
        <Text className="text-xs text-muted-foreground">
          {`Fica guardado como ${customFoodSummary(conferido.input)}.`}
        </Text>
      ) : null}

      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onCancelar}>
          {rotuloDoCancelar}
        </Button>
        <Button className="flex-1" onPress={enviar} disabled={enviando} loading={enviando}>
          {rotuloDoEnvio}
        </Button>
      </View>
      {rodape}
    </DrawerScrollView>
  );
}

function ChipDeBase({
  marcado,
  onPress,
  children,
}: {
  marcado: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: marcado }}
      accessibilityLabel={children}
      onPress={onPress}
      className={cn(
        'min-h-11 items-center justify-center rounded-full border px-3',
        marcado ? 'border-primary bg-primary/15' : 'border-border',
      )}
    >
      <Text
        className={cn('text-sm', marcado ? 'font-medium text-primary' : 'text-muted-foreground')}
      >
        {children}
      </Text>
    </Pressable>
  );
}
