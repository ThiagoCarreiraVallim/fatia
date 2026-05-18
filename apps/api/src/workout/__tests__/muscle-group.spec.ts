import { CANONICAL_MUSCLE_GROUPS, muscleGroupSchema } from '../helpers/muscle-group';

describe('muscleGroupSchema', () => {
  describe('accepts canonical values', () => {
    it.each(CANONICAL_MUSCLE_GROUPS)('accepts %s', (value) => {
      expect(muscleGroupSchema.parse(value)).toBe(value);
    });
  });

  describe('normalization', () => {
    it('trims surrounding whitespace', () => {
      expect(muscleGroupSchema.parse('  peito  ')).toBe('peito');
    });

    it('lowercases input', () => {
      expect(muscleGroupSchema.parse('PEITO')).toBe('peito');
    });

    it('preserves PT accents while lowercasing', () => {
      expect(muscleGroupSchema.parse('Braço')).toBe('braço');
    });
  });

  describe('accepts free-form names within the charset', () => {
    it('accepts multi-word names with spaces', () => {
      expect(muscleGroupSchema.parse('full body')).toBe('full body');
    });

    it('accepts hyphenated names', () => {
      expect(muscleGroupSchema.parse('antebraço-direito')).toBe('antebraço-direito');
    });

    it('accepts names with accents from other scripts (Unicode letters)', () => {
      expect(muscleGroupSchema.parse('mañana')).toBe('mañana');
    });
  });

  describe('rejects invalid input', () => {
    it('rejects empty string', () => {
      expect(() => muscleGroupSchema.parse('')).toThrow();
    });

    it('rejects whitespace-only (becomes empty after trim)', () => {
      expect(() => muscleGroupSchema.parse('   ')).toThrow();
    });

    it('rejects strings longer than 50 chars', () => {
      expect(() => muscleGroupSchema.parse('a'.repeat(51))).toThrow();
    });

    it('rejects digits', () => {
      expect(() => muscleGroupSchema.parse('peito1')).toThrow();
    });

    it('rejects punctuation and symbols', () => {
      expect(() => muscleGroupSchema.parse('peito!')).toThrow();
      expect(() => muscleGroupSchema.parse('<script>')).toThrow();
      expect(() => muscleGroupSchema.parse('peito/costas')).toThrow();
    });

    it('rejects leading/trailing separators (no anchoring letter)', () => {
      expect(() => muscleGroupSchema.parse(' -peito')).toThrow();
      expect(() => muscleGroupSchema.parse('peito-')).toThrow();
    });

    it('rejects non-string input', () => {
      expect(() => muscleGroupSchema.parse(123 as unknown as string)).toThrow();
      expect(() => muscleGroupSchema.parse(null as unknown as string)).toThrow();
    });
  });
});
