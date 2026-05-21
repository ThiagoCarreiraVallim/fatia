export const isCardioExercise = (ex: { muscleGroup: string }): boolean =>
  ex.muscleGroup === 'cardio';
