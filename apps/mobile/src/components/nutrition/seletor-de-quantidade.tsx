import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import {
  amountGrams,
  formatQuantity,
  stepQuantity,
  type Amount,
  type FoodPortion,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { DrawerInput } from './drawer-input';
import { NUMEROS_TABULARES, parsePositivo } from './helpers';
import { cores } from '@/theme/cores';

/**
 * Réplica de `apps/web/src/components/nutrition/amount-picker.tsx`: gramas
 * digitadas ou medida caseira × quantidade, com a conta em gramas ao lado. A
 * regra (meios, "½", gramas da medida) mora em `@fatia/api-client/portions`.
 */
export function SeletorDeQuantidade({
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

  return (
    <View className="gap-3">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Unidade"
        className="flex-row flex-wrap gap-2"
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
            onPress={() =>
              onChange({
                kind: 'portion',
                portionId: m.id,
                quantity: quantidade.kind === 'portion' ? quantidade.quantity : 1,
              })
            }
          >
            {`${m.label} · ${Math.round(m.grams)} g`}
          </Chip>
        ))}
        {!criando ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCriando(true)}
            className="min-h-11 flex-row items-center gap-1 rounded-full border border-dashed border-border px-3"
          >
            <Plus size={14} color={cores.placeholder} />
            <Text className="text-sm text-muted-foreground">Nova medida</Text>
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

      {quantidade.kind === 'grams' ? (
        <DrawerInput
          label="Quantidade (g)"
          autoFocus={autoFocus}
          keyboardType="numeric"
          inputMode="decimal"
          value={quantidade.grams}
          onChangeText={(valor) => onChange({ kind: 'grams', grams: valor })}
        />
      ) : (
        <View className="flex-row items-center gap-3">
          <BotaoDoPasso
            rotulo="Menos"
            onPress={() =>
              onChange({ ...quantidade, quantity: stepQuantity(quantidade.quantity, -1) })
            }
          >
            <Minus size={18} color={cores.foreground} />
          </BotaoDoPasso>
          <Text
            accessibilityLabel={`Quantas medidas: ${formatQuantity(quantidade.quantity)}`}
            style={NUMEROS_TABULARES}
            className="min-w-10 text-center text-lg font-semibold text-foreground"
          >
            {formatQuantity(quantidade.quantity)}
          </Text>
          <BotaoDoPasso
            rotulo="Mais"
            onPress={() =>
              onChange({ ...quantidade, quantity: stepQuantity(quantidade.quantity, 1) })
            }
          >
            <Plus size={18} color={cores.foreground} />
          </BotaoDoPasso>
          {gramas !== null ? (
            <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
              = {gramas.toLocaleString('pt-BR')} g
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Chip({
  marcado,
  rotuloAcessivel,
  onPress,
  children,
}: {
  marcado: boolean;
  rotuloAcessivel?: string;
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

function BotaoDoPasso({
  rotulo,
  onPress,
  children,
}: {
  rotulo: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-lg border border-border"
    >
      {children}
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
