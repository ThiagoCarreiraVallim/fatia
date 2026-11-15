import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Minus, Plus } from 'lucide-react-native';
import {
  amountGrams,
  formatQuantity,
  MAX_QUANTITY,
  parseDecimalInput,
  stepQuantity,
  type Amount,
  type FoodPortion,
} from '@fatia/api-client';
import { Button, DrawerTextInput, cn } from '@/components/ui';
import { DrawerInput } from './drawer-input';
import { NUMEROS_TABULARES, parsePositivo } from './helpers';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/nutrition/amount-picker.tsx`: gramas
 * digitadas ou medida caseira × quantidade, com a conta em gramas ao lado. A
 * regra (meios, "½", gramas da medida) mora em `@fatia/api-client/portions`.
 */
export function AmountPicker({
  medidas,
  quantidade,
  onChange,
  onCriarMedida,
  autoFocus,
}: {
  medidas: FoodPortion[];
  quantidade: Amount;
  onChange: (quantidade: Amount) => void;
  /** Cria a medida no servidor; a nova já vem selecionada. */
  onCriarMedida: (rotulo: string, gramas: number) => Promise<FoodPortion>;
  autoFocus?: boolean;
}) {
  const [criando, setCriando] = useState(false);
  const gramas = amountGrams(quantidade, medidas);

  const medida =
    quantidade.kind === 'portion' ? medidas.find((m) => m.id === quantidade.portionId) : undefined;

  return (
    <View className="gap-4">
      {/* O número grande no meio, − e + nas pontas (prancha Al-N3). O número é
        um campo: dá para digitar 1,5 ou 137 em vez de tocar várias vezes. */}
      {quantidade.kind === 'grams' ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <StepButton
              direction={-1}
              label="Menos 10 g"
              onPress={() => onChange({ kind: 'grams', grams: stepGrams(quantidade.grams, -1) })}
            />
            <View className="min-w-0 flex-1 items-center gap-1">
              {/* `decimal-pad`: o `numeric` do iOS não tem vírgula. */}
              <DrawerTextInput
                accessibilityLabel="Quantidade em gramas"
                autoFocus={autoFocus}
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={quantidade.grams}
                onChangeText={(valor) => onChange({ kind: 'grams', grams: valor })}
                selectionColor={colors.primaryText}
                style={[BIG_NUMBER, gramas === null ? { color: colors.destructive } : null]}
              />
              <Text className="text-[13px] text-muted-foreground">gramas</Text>
            </View>
            <StepButton
              direction={1}
              label="Mais 10 g"
              onPress={() => onChange({ kind: 'grams', grams: stepGrams(quantidade.grams, 1) })}
            />
          </View>
          {gramas === null ? (
            <Text accessibilityRole="alert" className="text-center text-sm text-destructive">
              Digite os gramas, como 120 ou 120,5.
            </Text>
          ) : null}
        </View>
      ) : (
        <QuantityField
          quantidade={quantidade}
          gramas={gramas}
          unitLabel={medida?.label ?? 'medida'}
          onChange={onChange}
        />
      )}

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Unidade"
        className="flex-row flex-wrap gap-1.5"
      >
        <Chip
          marcado={quantidade.kind === 'grams'}
          rotuloAcessivel="gramas"
          onPress={() =>
            onChange({ kind: 'grams', grams: gramas !== null ? String(Math.round(gramas)) : '100' })
          }
        >
          g
        </Chip>
        {medidas.map((m) => (
          <Chip
            key={m.id}
            marcado={quantidade.kind === 'portion' && quantidade.portionId === m.id}
            own={m.mine}
            onPress={() =>
              onChange({
                kind: 'portion',
                portionId: m.id,
                quantity: quantidade.kind === 'portion' ? quantidade.quantity : 1,
              })
            }
          >
            {`${m.label} · ${Math.round(m.grams)} g${m.mine ? ' · sua' : ''}`}
          </Chip>
        ))}
        {!criando ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Medida"
            onPress={() => setCriando(true)}
            style={{ borderWidth: 1, borderColor: colors.borderStrong }}
            className="h-9 flex-row items-center gap-1.5 rounded-chip px-3.5"
          >
            <Plus size={16} color={colors.mutedForeground} />
            <Text className="font-sans-semibold text-[13px] text-muted-foreground">Medida</Text>
          </Pressable>
        ) : null}
      </View>

      {criando ? (
        <NovaMedida
          onCancelar={() => setCriando(false)}
          onSalvar={async (rotulo, g) => {
            const criada = await onCriarMedida(rotulo, g);
            setCriando(false);
            onChange({ kind: 'portion', portionId: criada.id, quantity: 1 });
          }}
        />
      ) : null}
    </View>
  );
}

/** O número grande da prancha (Sora 56/700), sem cara de campo. */
const BIG_NUMBER = {
  ...NUMEROS_TABULARES,
  alignSelf: 'stretch' as const,
  textAlign: 'center' as const,
  fontFamily: 'Sora_700Bold',
  fontSize: 56,
  lineHeight: 64,
  letterSpacing: -2.2,
  color: colors.foreground,
  padding: 0,
};

/** ±10 g a partir do que está no campo; vazio ou ilegível começa de 0. */
function stepGrams(text: string, direction: 1 | -1): string {
  const current = parseDecimalInput(text) ?? 0;
  return String(Math.max(10, Math.round((current + direction * 10) / 10) * 10));
}

/** "1,5" no campo: a vírgula é como a pessoa escreve; o ponto também vale. */
function quantityText(quantity: number): string {
  return String(quantity).replace('.', ',');
}

/**
 * Quantas medidas: digitável (1,5; 0,25) e com − e + de meio em meio, como no
 * PWA. O campo guarda o texto enquanto a pessoa digita; o número só sobe quando
 * dá para ler.
 */
function QuantityField({
  quantidade,
  gramas,
  unitLabel,
  onChange,
}: {
  quantidade: Extract<Amount, { kind: 'portion' }>;
  gramas: number | null;
  unitLabel: string;
  onChange: (quantidade: Amount) => void;
}) {
  const [text, setText] = useState(quantityText(quantidade.quantity));
  const [synced, setSynced] = useState(quantidade.quantity);
  const [editing, setEditing] = useState(false);
  if (synced !== quantidade.quantity && Number.isFinite(quantidade.quantity)) {
    setSynced(quantidade.quantity);
    setText(quantityText(quantidade.quantity));
  }
  const parsed = parseDecimalInput(text);
  const invalid = parsed === null || parsed <= 0 || parsed > MAX_QUANTITY;
  const step = (direction: 1 | -1) => {
    const base = Number.isFinite(quantidade.quantity) ? quantidade.quantity : 1;
    onChange({ ...quantidade, quantity: stepQuantity(base, direction) });
  };

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <StepButton direction={-1} label="Menos" onPress={() => step(-1)} />
        <View className="min-w-0 flex-1 items-center gap-1">
          <DrawerTextInput
            accessibilityLabel="Quantas medidas"
            keyboardType="decimal-pad"
            inputMode="decimal"
            // Fora do foco, "1½" como na prancha; no foco, o número para editar.
            value={editing || invalid ? text : formatQuantity(quantidade.quantity)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            selectionColor={colors.primaryText}
            onChangeText={(next) => {
              setText(next);
              const value = parseDecimalInput(next);
              const quantity =
                value !== null && value > 0 && value <= MAX_QUANTITY ? value : Number.NaN;
              setSynced(quantity);
              onChange({ ...quantidade, quantity });
            }}
            style={[BIG_NUMBER, invalid ? { color: colors.destructive } : null]}
          />
          <Text
            accessibilityLiveRegion="polite"
            style={NUMEROS_TABULARES}
            className="text-[13px] text-muted-foreground"
          >
            {gramas !== null ? `${unitLabel} · ${gramas.toLocaleString('pt-BR')} g` : unitLabel}
          </Text>
        </View>
        <StepButton direction={1} label="Mais" onPress={() => step(1)} />
      </View>
      {invalid ? (
        <Text accessibilityRole="alert" className="text-center text-sm text-destructive">
          {`Digite um número, como 1,5 (até ${MAX_QUANTITY}).`}
        </Text>
      ) : null}
    </View>
  );
}

function Chip({
  marcado,
  rotuloAcessivel,
  own = false,
  onPress,
  children,
}: {
  marcado: boolean;
  rotuloAcessivel?: string;
  /** Medida criada pela pessoa: o verde suave da prancha. */
  own?: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: marcado }}
      accessibilityLabel={rotuloAcessivel ?? children}
      onPress={onPress}
      className={cn(
        'h-9 items-center justify-center rounded-chip px-3.5',
        marcado ? 'bg-foreground' : own ? 'bg-primary/15' : 'bg-muted',
      )}
    >
      <Text
        className={cn(
          'font-sans-semibold text-[13px]',
          marcado ? 'text-background' : own ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}

/** − apagado, + verde, 56 pt (prancha Al-N3). */
function StepButton({
  direction,
  label,
  onPress,
}: {
  direction: 1 | -1;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        'h-14 w-14 items-center justify-center rounded-pill active:opacity-70',
        direction > 0 ? 'bg-primary' : 'bg-surface-3',
      )}
    >
      {direction > 0 ? (
        <Plus size={24} color={colors.primaryForeground} />
      ) : (
        <Minus size={18} color={colors.foreground} />
      )}
    </Pressable>
  );
}

function NovaMedida({
  onCancelar,
  onSalvar,
}: {
  onCancelar: () => void;
  onSalvar: (rotulo: string, gramas: number) => Promise<void>;
}) {
  const [rotulo, setRotulo] = useState('');
  const [gramas, setGramas] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const g = parsePositivo(gramas.replace(',', '.'));
  const valido = rotulo.trim().length > 0 && g !== null;

  return (
    <View className="gap-2 rounded-lg border border-border p-3">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <DrawerInput
            label="Nome da medida"
            placeholder="Ex.: concha"
            maxLength={40}
            value={rotulo}
            onChangeText={setRotulo}
          />
        </View>
        <View className="w-28">
          <DrawerInput
            label="Gramas da medida"
            keyboardType="numeric"
            inputMode="decimal"
            value={gramas}
            onChangeText={setGramas}
          />
        </View>
      </View>
      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onCancelar}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!valido || salvando}
          loading={salvando}
          onPress={async () => {
            if (g === null) return;
            setSalvando(true);
            setErro(null);
            try {
              await onSalvar(rotulo.trim(), g);
            } catch (e) {
              setErro((e as Error).message);
              setSalvando(false);
            }
          }}
        >
          Salvar medida
        </Button>
      </View>
    </View>
  );
}
