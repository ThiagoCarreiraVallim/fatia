import { estimate1RM } from './estimate-1rm';

describe('estimate1RM', () => {
  it('applies Epley formula: weight * (1 + reps/30)', () => {
    // 100 * (1 + 10/30) = 100 * 1.3333 = 133.33
    expect(estimate1RM(100, 10)).toBe(133.33);
  });
  it('works for single rep', () => {
    // 100 * (1 + 1/30) = 103.33
    expect(estimate1RM(100, 1)).toBe(103.33);
  });
});
