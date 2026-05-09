export const estimate1RM = (weightKg: number, reps: number): number =>
  Math.round(weightKg * (1 + reps / 30) * 100) / 100;
