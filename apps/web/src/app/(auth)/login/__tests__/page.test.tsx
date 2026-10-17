import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoginPage from '../page';

async function renderLogin(next?: string) {
  render(await LoginPage({ searchParams: Promise.resolve(next ? { next } : {}) }));
}

describe('login', () => {
  it('sem retorno, as três entradas vão direto ao Logto', async () => {
    await renderLogin();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in',
    );
    expect(screen.getByRole('link', { name: 'Criar conta grátis' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?tela=cadastro',
    );
  });

  it('o link de convite segue junto em todas as entradas', async () => {
    await renderLogin('/c/tok');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?next=%2Fc%2Ftok',
    );
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?tela=senha&next=%2Fc%2Ftok',
    );
  });

  it('um retorno para fora do app é ignorado', async () => {
    await renderLogin('//evil.example');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/api/logto/sign-in',
    );
  });
});
