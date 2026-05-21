import { isCardioExercise } from '../helpers/is-cardio';

describe('isCardioExercise', () => {
  it('returns true for cardio muscleGroup', () => {
    expect(isCardioExercise({ muscleGroup: 'cardio' })).toBe(true);
  });
  it('returns false for strength muscleGroups', () => {
    expect(isCardioExercise({ muscleGroup: 'peito' })).toBe(false);
    expect(isCardioExercise({ muscleGroup: 'costas' })).toBe(false);
    expect(isCardioExercise({ muscleGroup: 'core' })).toBe(false);
  });
});
