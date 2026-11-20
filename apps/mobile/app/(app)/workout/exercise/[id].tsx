import { useLocalSearchParams } from 'expo-router';
import { exerciseIdFromParam } from '@fatia/api-client';
import { ExerciseHowTo } from '@/components/workout/exercise-how-to';

/**
 * "Como fazer" (prancha `Al-T9`): ver `ExerciseHowTo`. Id que não é exercício
 * (link velho ou digitado) dá erro em vez de carregar para sempre.
 */
export default function ExerciseHowToScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHowTo exerciseId={exerciseIdFromParam(id)} />;
}
