import { calculatePace } from '../helpers/calculate-pace';

describe('calculatePace', () => {
  it('returns seconds per km (1800s / 5000m = 360 s/km)', () => {
    expect(calculatePace(1800, 5000)).toBe(360);
  });
  it('returns null when distanceMeters is 0', () => {
    expect(calculatePace(1800, 0)).toBeNull();
  });
  it('returns null when distanceMeters is negative', () => {
    expect(calculatePace(1800, -100)).toBeNull();
  });
});
