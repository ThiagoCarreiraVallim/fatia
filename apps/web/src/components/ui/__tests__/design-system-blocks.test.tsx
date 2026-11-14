import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ShareCard, SHARE_CARD_FIELDS } from '@/components/sharing/share-card';
import { BrandColorField } from '@/components/org/brand-color-field';
import { brandStyle } from '@/components/community/brand-cover';
import { ProBlock } from '@/components/billing/pro-block';

/** Blocos de produto do DS v2 (#368): cartão de compartilhar, cor da comunidade, PRO. */

describe('ShareCard', () => {
  it('não tem campo para dado do corpo', () => {
    for (const f of SHARE_CARD_FIELDS)
      expect(f).not.toMatch(/weight|peso|measure|medida|body|corpo|fat|gordura|photo|foto/i);
  });

  it('aparece como nome, @ ou ninguém', () => {
    const data = { kind: 'streak' as const, headline: '12 dias', caption: 'Sequência de registro' };
    const { rerender } = render(
      <ShareCard data={data} identity={{ as: 'handle', value: 'ana' }} />,
    );
    expect(
      screen.getByRole('figure', { name: 'Sequência de registro: 12 dias' }),
    ).toHaveTextContent('@ana');
    rerender(<ShareCard data={data} identity={{ as: 'none' }} />);
    expect(screen.getByRole('figure')).not.toHaveTextContent('@ana');
  });
});

describe('cor da comunidade', () => {
  function Field({ initial }: { initial: string }) {
    const [v, setV] = useState(initial);
    return <BrandColorField value={v} onChange={setV} />;
  }

  it('verde do Fatia é recusado, com a mensagem ligada ao campo', () => {
    render(<Field initial="#2CE500" />);
    const input = screen.getByRole('textbox', { name: 'Cor da comunidade' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/verde do Fatia/);
  });

  it('cor sem contraste avisa e "Usar" aplica a sugestão', async () => {
    render(<Field initial="#7C5CFF" />);
    expect(screen.getByRole('status')).toHaveTextContent('4,5:1');
    await userEvent.click(screen.getByRole('button', { name: /Usar #/ }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Cor da comunidade' })).toHaveValue('#6b4fde');
  });

  it('cor recusada cai na cor padrão na capa', () => {
    expect(brandStyle('#2ce500')).toEqual(brandStyle(null));
    expect(brandStyle('#7c5cff')).not.toEqual(brandStyle(null));
  });
});

describe('ProBlock', () => {
  it('no iOS sem compra oferece o código, nunca o preço', () => {
    render(<ProBlock state={{ kind: 'pro-expired' }} canPurchase={false} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Tenho um código' })).toBeInTheDocument();
  });
});
