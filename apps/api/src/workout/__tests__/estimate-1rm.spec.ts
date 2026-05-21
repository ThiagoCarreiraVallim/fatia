import { estimate1RM } from '../helpers/estimate-1rm';

describe('estimate1RM', () => {
  it('applies Epley formula: weight * (1 + reps/30)', () => {
    expect(estimate1RM(100, 10)).toBe(133.33);
  });
  it('works for single rep', () => {
    expect(estimate1RM(100, 1)).toBe(103.33);
  });
});
