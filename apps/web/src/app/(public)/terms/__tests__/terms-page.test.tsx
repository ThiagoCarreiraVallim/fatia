import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TermsPage from '../page';

/**
 * Os Termos contra o plano que existe (ADR 024). A frase "não há plano pago"
 * virou mentira com o PRO; o que a pessoa precisa ler antes de assinar é o
 * preço, a renovação, como cancelar e o arrependimento.
 */
function secao(titulo: string): string {
  const cabecalho = screen.getByRole('heading', { name: titulo, level: 2 });
  return cabecalho.closest('section')?.textContent ?? '';
}

describe('termos de uso — custo', () => {
  it('não promete mais que não há plano pago', () => {
    render(<TermsPage />);
    expect(secao('Custo e disponibilidade')).not.toMatch(/não há plano pago/i);
    expect(secao('Custo e disponibilidade')).not.toMatch(/nunca vira cobrança/i);
  });

  it('diz preço, renovação, cancelamento e arrependimento', () => {
    render(<TermsPage />);
    const custo = secao('Custo e disponibilidade');
    expect(custo).toMatch(/R\$ 19,90 por mês/);
    expect(custo).toMatch(/R\$ 179 por ano/);
    expect(custo).toMatch(/renovação automática/i);
    expect(custo).toMatch(/art\. 49/);
    expect(custo).toMatch(/App Store ou no Google Play/);
  });

  it('o Free continua com o app inteiro e o MCP', () => {
    render(<TermsPage />);
    expect(secao('Custo e disponibilidade')).toMatch(/Free[\s\S]*gratuito[\s\S]*MCP/);
  });
});
