import { useLocalSearchParams } from 'expo-router';
import { ExerciseHowTo } from '@/components/workout/exercise-how-to';

/** "Como fazer" (prancha `Al-T9`): ver `ExerciseHowTo`. */
export default function ExerciseHowToScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);
  return <ExerciseHowTo exerciseId={Number.isInteger(exerciseId) ? exerciseId : 0} />;
}
