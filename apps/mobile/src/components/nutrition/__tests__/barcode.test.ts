import { describe, expect, it } from 'vitest';
import { TIPOS_DE_CODIGO } from '../barcode';

// A lógica da leitura é testada em `packages/api-client/src/__tests__/barcode.test.ts`.
describe('TIPOS_DE_CODIGO', () => {
  it('não inclui QR Code', () => {
    // Com QR ligado, qualquer adesivo enquadrado sem querer dispara a consulta.
    expect(TIPOS_DE_CODIGO).not.toContain('qr');
  });
});
