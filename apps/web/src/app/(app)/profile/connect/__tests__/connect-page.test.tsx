import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VERIFY_PROMPT } from '@/components/profile/connect-steps';
import { mcpServerUrl } from '@/lib/mcp-url';
import ConnectPage from '../page';

/**
 * O fluxo guiado de conexão (issue #164).
 *
 * O critério de pronto da issue é "alguém sem conhecimento técnico conecta a própria IA sem pedir
 * ajuda". A parte disso que dá para testar aqui é a linguagem: a tela anterior falava em "OAuth",
 * "Logto" e "servidor MCP" — os três termos que a issue proíbe — e mandava colar um endereço de
 * exemplo. Este spec renderiza a tela de verdade e olha o texto que chega ao usuário.
 */

vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'user-1',
    email: 'atleta@exemplo.test',
    name: 'Atleta',
    role: 'USER',
  })),
}));

async function renderPage() {
  render(await ConnectPage());
}

describe('tela de conectar a IA', () => {
  it('mostra os passos na ordem, com as palavras que estão na tela do Claude', async () => {
    await renderPage();

    // "Settings"/"Connectors" ficam em inglês de propósito: são o rótulo que o usuário vai
    // procurar na interface dele. Traduzir aqui é mandá-lo procurar um botão que não existe.
    expect(screen.getByText(/Settings → Connectors/)).toBeInTheDocument();
    expect(screen.getByText(/Add custom connector/)).toBeInTheDocument();
    expect(screen.getByText('Cole o endereço do Fatia')).toBeInTheDocument();
  });

  it('oferece o endereço e a pergunta de verificação para copiar', async () => {
    await renderPage();

    // Digitar o endereço à mão no celular é a origem mais provável de "não conectou".
    expect(screen.getByRole('button', { name: 'Copiar endereço do Fatia' })).toBeInTheDocument();
    // O endereço mostrado é o que `mcpServerUrl` monta, não um exemplo escrito na tela — foi
    // exatamente um domínio de exemplo que quebrou a versão anterior desta tela.
    expect(screen.getByText(mcpServerUrl())).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar pergunta' })).toBeInTheDocument();
    expect(screen.getByText(VERIFY_PROMPT)).toBeInTheDocument();
  });

  it('diz qual conta usar na autorização', async () => {
    await renderPage();

    // "Autorizei com outro e-mail" é uma das três falhas nomeadas no diagnóstico, e a única que o
    // usuário não tem como descobrir sozinho: do lado do Claude tudo parece ter dado certo.
    expect(screen.getAllByText(/atleta@exemplo\.test/).length).toBeGreaterThan(0);
  });

  it('nomeia as três causas comuns em vez de um erro genérico', async () => {
    await renderPage();

    expect(screen.getByText('Não funcionou?')).toBeInTheDocument();
    expect(screen.getByText(/não conseguiu encontrar o endereço/i)).toBeInTheDocument();
    expect(screen.getByText(/outra conta na hora de autorizar/i)).toBeInTheDocument();
    expect(screen.getByText(/não sabe nada sobre mim/i)).toBeInTheDocument();
  });

  it('não usa jargão de protocolo em lugar nenhum do texto visível', async () => {
    const { container } = render(await ConnectPage());

    // O endereço em si contém `/mcp` e não tem como não conter — é o endereço. Só ele sai da
    // conferência, e recortado com precisão: um `https?:\/\/\S+` engoliria também a palavra
    // colada nele no `textContent` e poderia esconder jargão de verdade.
    const visible = (container.textContent ?? '').replace(/https?:\/\/[^\s]*?\/mcp\b/g, '');

    for (const jargon of [/\bMCP\b/i, /\bOAuth\b/i, /\bDCR\b/i, /\bLogto\b/i, /\bBearer\b/i]) {
      expect(visible).not.toMatch(jargon);
    }
  });
});
