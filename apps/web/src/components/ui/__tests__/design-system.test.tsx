import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { duration, ICON_NAMES, ICONS } from '@fatia/design';
import { Button } from '../button';
import { Checkbox, Segmented, Switch } from '../selection';
import { Input } from '../input';
import { SwipeRow } from '../swipe-row';
import { ICON_COMPONENTS } from '../icon';
import { useIsDesktop } from '../drawer';
import { toastDuration } from '../toaster';
import { STATUS_BADGE_LABELS } from '../badge';
import { Banner } from '../banner';

/**
 * Componentes base do DS v2 (#368). Cada caso olha o que a pessoa (ou o leitor
 * de tela) recebe: papel, nome acessível, estado — não o texto do fonte.
 */

function mockMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matches(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ícones', () => {
  it('todo nome do canvas tem um componente, e é o ícone do lucide mapeado', () => {
    for (const name of ICON_NAMES) {
      const component = ICON_COMPONENTS[name];
      expect(component, name).toBeDefined();
      const target = ICONS[name];
      if (target.startsWith('custom:')) expect(component).toBe('custom');
      else expect((component as { displayName?: string }).displayName, name).toBe(target);
    }
  });
});

describe('Button', () => {
  it('as variantes novas renderizam um botão com nome', () => {
    for (const variant of [
      'default',
      'secondary',
      'outline',
      'text',
      'danger',
      'add',
      'ai',
      'brand',
    ] as const) {
      const { unmount } = render(<Button variant={variant}>Salvar</Button>);
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
      unmount();
    }
  });

  it('o tamanho xl tem 52 px de altura (alvo do botão principal)', () => {
    render(<Button size="xl">Continuar</Button>);
    expect(screen.getByRole('button').className).toContain('h-[52px]');
  });
});

describe('seleção', () => {
  it('Segmented é um radiogroup e as setas trocam a opção', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Tema"
        value="system"
        onChange={onChange}
        options={[
          { value: 'system', label: 'Sistema' },
          { value: 'dark', label: 'Escuro' },
          { value: 'light', label: 'Claro' },
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
    screen.getByRole('radio', { name: 'Sistema' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('Switch e Checkbox expõem o estado marcado', async () => {
    const onSwitch = vi.fn();
    render(
      <>
        <Switch checked={false} onCheckedChange={onSwitch} label="Lembretes" />
        <Checkbox checked onCheckedChange={() => {}} label="Feito" />
      </>,
    );
    const sw = screen.getByRole('switch', { name: 'Lembretes' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onSwitch).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Feito' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Input com erro', () => {
  it('marca aria-invalid e liga a mensagem pelo aria-describedby', () => {
    render(<Input aria-label="Peso" error="Use um número" />);
    const input = screen.getByRole('textbox', { name: 'Peso' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Use um número');
  });
});

describe('SwipeRow', () => {
  it('o gesto tem caminho pelo teclado: "Mais ações" abre e Esc fecha', async () => {
    const onDelete = vi.fn();
    render(
      <SwipeRow
        label="Café da manhã"
        actions={[{ label: 'Apagar', tone: 'danger', onPress: onDelete }]}
      >
        Café da manhã
      </SwipeRow>,
    );
    const more = screen.getByRole('button', { name: 'Mais ações: Café da manhã' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();

    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(onDelete).toHaveBeenCalledOnce();

    await userEvent.click(more);
    await userEvent.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Folha', () => {
  it('no desktop (md+) abre como painel lateral', () => {
    mockMatchMedia((q) => q === '(min-width: 768px)');
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true);
  });

  it('no celular continua folha de baixo', () => {
    mockMatchMedia(() => false);
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false);
  });

  it('o painel do desktop tem 480 px', () => {
    const src = readFileSync(join(__dirname, '..', 'drawer.tsx'), 'utf8');
    expect(src).toContain('data-[vaul-drawer-direction=right]:w-[480px]');
  });
});

describe('Toast', () => {
  it('fica 2,5 s; com "Desfazer" fica 5 s', () => {
    expect(toastDuration(false)).toBe(2500);
    expect(toastDuration(true)).toBe(5000);
    expect(duration.toast).toBe(2500);
  });
});

describe('Selos e faixas', () => {
  it('textos dos selos de estado', () => {
    expect(STATUS_BADGE_LABELS.trial(1)).toBe('Teste · 1 dia');
    expect(STATUS_BADGE_LABELS.trial(5)).toBe('Teste · 5 dias');
    expect(STATUS_BADGE_LABELS['pro-community']('Academia')).toBe('PRO · Academia');
    expect(STATUS_BADGE_LABELS.risk).toBe('Em risco');
  });

  it('Banner de perigo é alert; os outros são status', () => {
    render(
      <>
        <Banner tone="danger" title="Pagamento recusado" />
        <Banner tone="info" title="Sem conexão" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pagamento recusado');
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão');
  });
});

describe('títulos no CSS', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');

  it('h1, h2 e h3 saem em Sora por padrão (título de tela, de seção e de card)', () => {
    const base = css.slice(css.indexOf('@layer base'), css.indexOf('@layer utilities'));
    expect(base).toMatch(/h1,\s*h2,\s*h3\s*\{\s*@apply font-display;/);
  });
});

describe('movimento no CSS', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));

  it('cada animação do DS tem classe, e todas param com reduzir movimento', () => {
    const classes = [...css.matchAll(/^\s*\.(anim-[a-z-]+)\s*[{,]/gm)].map((m) => m[1]);
    expect(new Set(classes).size).toBeGreaterThanOrEqual(10);
    for (const c of new Set(classes)) expect(reduced, c).toContain(`.${c}`);
  });

  it('as durações batem com @fatia/design', () => {
    expect(css).toContain(`${duration.sheet}ms`);
    expect(css).toContain(`${duration.data}ms`);
    expect(css).toContain(`${duration.tab}ms`);
  });
});
