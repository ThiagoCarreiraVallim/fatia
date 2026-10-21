import { Pressable, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { useOpenExerciseDetail } from '@/components/workout/exercise-detail-host';
import { cores } from '@/theme/cores';

/**
 * Nome do exercício em foco e, logo abaixo, o botão "Como fazer".
 *
 * Antes era o nome tocável com um "i" de 14px ao lado: quase ninguém achava o
 * detalhe — músculos, instruções, vídeo — justamente no momento em que ele é
 * útil, no meio do treino e diante de um aparelho que a pessoa não conhece.
 * Um botão com rótulo diz o que faz sem precisar adivinhar.
 */
export function ExerciseTitle({
  kicker,
  exerciseId,
  exerciseName,
}: {
  /** O rótulo pequeno de cima: "EM ANDAMENTO", "CARDIO". */
  kicker: string;
  exerciseId: number;
  exerciseName: string;
}) {
  const openDetail = useOpenExerciseDetail();

  return (
    <View className="items-center">
      <Text className="text-[10px] font-extrabold tracking-wide text-primary">{kicker}</Text>
      <Text
        accessibilityRole="header"
        className="mt-1 text-center text-lg font-extrabold text-foreground"
      >
        {exerciseName}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Como fazer ${exerciseName}`}
        accessibilityHint="Abre músculos, instruções e vídeo do exercício"
        onPress={() => openDetail(exerciseId)}
        className="mt-2 min-h-[44px] flex-row items-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-4 active:opacity-80"
      >
        <BookOpen size={16} color={cores.primary} />
        <Text className="text-sm font-bold text-primary">Como fazer</Text>
      </Pressable>
    </View>
  );
}
