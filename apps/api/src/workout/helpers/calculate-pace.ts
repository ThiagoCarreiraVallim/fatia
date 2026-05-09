export const calculatePace = (durationSeconds: number, distanceMeters: number): number | null => {
  if (distanceMeters <= 0) return null;
  return Math.round((durationSeconds / distanceMeters) * 1000);
};
