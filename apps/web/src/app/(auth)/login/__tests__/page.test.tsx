import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import LoginPage from '../page';

async function renderLogin(params: { next?: string; modo?: string } = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

const form = () => screen.getByRole('button', { name: /Criar conta|Entrar/ }).closest('form')!;
const hidden = (name: string) =>
  form().querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value ?? null;

describe('login (Onb-01b)', () => {
  it('abre em "Criar conta": nome e e-mail vão ao Logto na tela de cadastro, sem senha aqui', async () => {
    await renderLogin();
    expect(screen.getByRole('tab', { name: 'Criar conta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Seu nome')).toHaveAttribute('name', 'nome');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('name', 'email');
    expect(screen.queryByLabelText(/Senha/)).not.toBeInTheDocument();
    expect(form()).toHaveAttribute('action', '/api/logto/sign-in');
    expect(hidden('tela')).toBe('cadastro');
  });

  it('"Entrar" tira o nome e a tela de cadastro, e mostra o "Esqueci minha senha"', async () => {
    await renderLogin();
    await userEvent.click(screen.getByRole('tab', { name: 'Entrar' }));
    expect(screen.queryByLabelText('Seu nome')).not.toBeInTheDocument();
    expect(hidden('tela')).toBeNull();
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?tela=senha',
    );
  });

  it('Google e Apple vão direto ao conector, levando o link de convite', async () => {
    await renderLogin({ next: '/c/tok' });
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?next=%2Fc%2Ftok&social=google',
    );
    expect(screen.getByRole('link', { name: 'Apple' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?next=%2Fc%2Ftok&social=apple',
    );
    expect(hidden('next')).toBe('/c/tok');
  });

  it('um retorno para fora do app é ignorado', async () => {
    await renderLogin({ next: '//evil.example' });
    expect(hidden('next')).toBeNull();
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?social=google',
    );
  });

  it('Termos e Privacidade no pé', async () => {
    await renderLogin();
    expect(screen.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacy');
  });
});
