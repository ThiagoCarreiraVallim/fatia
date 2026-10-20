import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import PrivacyPage from '../page';
import TermsPage from '../../terms/page';

/** O controlador vem do ambiente da instância — nada de nome fixo no código. */
function texto(page: () => React.JSX.Element): string {
  return render(page()).container.textContent ?? '';
}

describe('controlador dos dados por configuração', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('com as variáveis, a privacidade e os termos nomeiam a empresa, o CNPJ e o encarregado', () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', 'Studio Exemplo LTDA');
    vi.stubEnv('LEGAL_ENTITY_DOCUMENT', '12.345.678/0001-90');
    vi.stubEnv('DPO_EMAIL', 'privacidade@exemplo.com.br');

    for (const pagina of [PrivacyPage, TermsPage]) {
      const t = texto(pagina);
      expect(t).toContain('Studio Exemplo LTDA');
      expect(t).toContain('12.345.678/0001-90');
      expect(t).toContain('privacidade@exemplo.com.br');
    }
  });

  it('sem as variáveis, diz que é quem opera a instância, sem inventar ninguém', () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', '');
    vi.stubEnv('LEGAL_ENTITY_DOCUMENT', '');
    vi.stubEnv('DPO_EMAIL', '');

    const t = texto(PrivacyPage);
    expect(t).toMatch(/quem opera esta instância/i);
    expect(t).not.toMatch(/CNPJ \d/);
  });
});
