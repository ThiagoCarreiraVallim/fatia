import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { elapsedLabel, formatTimeOfDay, pluralize, type SessionProgress } from './format';

/**
 * Cabeçalho fixo da sessão — o progresso e as duas saídas ficam sempre à vista.
 *
 * No PWA isso rola com a página: a tela do navegador é alta e a pessoa está
 * sentada. Aqui o card do exercício ocupa quase tudo, e "quantos exercícios
 * faltam" é a pergunta que se faz a cada série; se precisar rolar para cima para
 * responder, ninguém rola.
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
    <View className="border-b border-border bg-background px-5 pb-3 pt-2">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-lg font-extrabold text-foreground">
            Treino em andamento
          </Text>
          <Text className="text-xs text-muted-foreground">
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
