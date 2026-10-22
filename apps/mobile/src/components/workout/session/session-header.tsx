import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { elapsedLabel, formatTimeOfDay, pluralize, type SessionProgress } from './format';

/**
 * Cabeçalho da sessão: horário de início, as duas saídas e o progresso.
 *
 * Já foi fixo acima da lista, para o "quantos faltam" ficar sempre à vista.
 * Na prática ele roubava uma faixa da tela inteira o treino todo, e o que se
 * olha a cada série é o card do exercício. Agora rola com o conteúdo, como no
 * PWA; o progresso continua sendo a primeira coisa ao abrir a sessão.
 */
export function SessionHeader({
  startedAt,
  progress,
  onCancel,
  onFinish,
}: {
  startedAt: string;
  progress: SessionProgress;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const elapsed = useElapsed(startedAt);
  const progressLabel = `${progress.done}/${progress.total} ${pluralize(progress.total, 'exercício', 'exercícios')}`;

  return (
    <View>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          {/* O título "Treino em andamento" mora na barra de topo. */}
          <Text className="text-sm text-muted-foreground">
            Iniciado às {formatTimeOfDay(startedAt)} · {elapsed}
          </Text>
        </View>

        <Button variant="ghost" size="sm" onPress={onCancel} textClassName="text-muted-foreground">
          Cancelar
        </Button>
        <Button variant="outline" size="sm" onPress={onFinish}>
          Finalizar
        </Button>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Progresso do treino: ${progressLabel}`}
        accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
        className="mt-2 flex-row items-center gap-2"
      >
        <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </View>
        <Text className="text-[11px] font-bold text-muted-foreground">{progressLabel}</Text>
      </View>
    </View>
  );
}

/** Relógio da sessão. Um minuto de resolução dispensa tique de segundo. */
function useElapsed(startedAt: string): string {
  const [label, setLabel] = useState(() => elapsedLabel(startedAt));

  // O recálculo imediato na troca de sessão sai do efeito e vira ajuste durante o
  // render (#187): a comparação é a mesma que estava nas dependências, então o
  // rótulo muda no mesmo momento, só que sem pintar um quadro com o tempo da
  // sessão anterior. Não há passagem de montagem porque o `useState` acima já
  // inicializa com o mesmo cálculo — no efeito, essa primeira linha era um no-op.
  // O intervalo continua no efeito: assinar um temporizador é justamente o que
  // efeito serve para fazer.
  const [previousStartedAt, setPreviousStartedAt] = useState(startedAt);
  if (previousStartedAt !== startedAt) {
    setPreviousStartedAt(startedAt);
    setLabel(elapsedLabel(startedAt));
  }

  useEffect(() => {
    const id = setInterval(() => setLabel(elapsedLabel(startedAt)), 15_000);
    return () => clearInterval(id);
  }, [startedAt]);

  return label;
}
