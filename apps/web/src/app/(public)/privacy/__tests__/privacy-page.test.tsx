import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../page';

/**
 * A política de privacidade **pública** contra o que o produto realmente faz.
 *
 * Não é teste de texto por gosto de testar texto. Esta página é o documento
 * operativo perante a LGPD, e o reconhecimento de refeição por foto (#139)
 * tornou três afirmações dela falsas de uma vez, sem que ninguém editasse uma
 * linha: "a imagem nunca chega ao Fatia", "não há chave de API de LLM no
 * servidor" e uma lista de terceiros sem o provedor de visão. O `DATA_RETENTION.md`
 * foi atualizado; a página que o usuário lê, não. É o mesmo raciocínio do
 * docstring do `strip-exif.ts` — a afirmação vira mentira sozinha —, e o que
 * torna essa classe de defeito difícil é que ninguém volta para reler.
 *
 * O que se afirma aqui é só o que é **verificável**: a ausência das frases que
 * ficaram falsas e a presença do terceiro que passou a existir, no lugar certo
 * da página.
 */

/** O texto do bloco `<section>` cujo `<h2>` é `titulo`. */
function secao(titulo: string): string {
  const cabecalho = screen.getByRole('heading', { name: titulo, level: 2 });
  const bloco = cabecalho.closest('section');
  if (!bloco) throw new Error(`Seção "${titulo}" não encontrada`);
  return bloco.textContent ?? '';
}

describe('política de privacidade — reconhecimento por foto', () => {
  it('não afirma mais que a imagem nunca chega ao Fatia', () => {
    render(<PrivacyPage />);

    // A foto agora vai do aplicativo para a API do Fatia e de lá para o
    // provedor de visão. Dizer o contrário é o oposto do que acontece.
    expect(secao('O que NÃO coletamos')).not.toMatch(/nunca chega ao Fatia/i);
    // O que continua verdade — e é o que a pessoa precisa saber — é que nada é
    // guardado. A frase não pode simplesmente sumir junto com a mentira.
    expect(secao('O que NÃO coletamos')).toMatch(/nenhuma imagem é armazenada/i);
  });

  it('não afirma mais que não há chave de API de LLM no servidor', () => {
    render(<PrivacyPage />);

    const ia = secao('Inteligência artificial');
    // `AI_API_KEY` e `AGENT_API_KEY` estão no `.env.example` e no compose.
    expect(ia).not.toMatch(/não há chave de API de LLM no servidor/i);
    // E o motivo de ela existir precisa estar dito, não só a negativa removida.
    expect(ia).toMatch(/reconhecimento de refeição por foto/i);
    expect(ia).toMatch(/provedor de visão/i);
  });

  it('lista o provedor de visão entre os terceiros, e não só na seção de IA', () => {
    render(<PrivacyPage />);

    // A pergunta "com quem vocês compartilham meus dados" tem uma seção só
    // dela, e é nela que um titular (ou a ANPD) vai olhar. Descrever o envio na
    // seção de IA e omiti-lo aqui deixa a lista incompleta.
    expect(secao('Com quem compartilhamos')).toMatch(/provedor de visão/i);
  });

  it('diz que a foto sai sem os metadados que localizam a pessoa', () => {
    render(<PrivacyPage />);

    // A remoção de EXIF/GPS é a garantia que justifica chamar o envio de
    // aceitável. Se ela não está escrita, o usuário não tem como saber que
    // existe — e a promessa não vale nada por escrito em outro lugar.
    const ia = secao('Inteligência artificial');
    expect(ia).toMatch(/EXIF/i);
    expect(ia).toMatch(/GPS/i);
  });
});
