import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPage from '../page';

/**
 * A política de privacidade como afirmação verificável (issue #136).
 *
 * Um teste sobre texto jurídico parece estranho até se olhar o modo de falha: o que quebra aqui não
 * é o layout, é a **frase virar mentira sem ninguém perceber**. Foi exatamente isso que a #136
 * existiu para consertar em `docs/DATA_RETENTION.md`, e a primeira versão desta página reintroduziu
 * o mesmo defeito num item novo — prometia, em nome de um terceiro, que ele "não guarda nada",
 * enquanto o Cloudflare AI Gateway registra corpo de requisição e de resposta por padrão.
 *
 * O que estes casos prendem é a **fronteira da promessa**: o Fatia pode afirmar o que o Fatia faz,
 * e sobre o terceiro só pode afirmar o que o pedido exige (os campos de roteamento, que estão no
 * código) ou o que ele declara. Uma promessa absoluta em nome de quem não se controla é o defeito.
 */

/** O texto corrido da página, como o titular lê — sem tags no meio de uma frase. */
function textoDaPagina(): string {
  const { container } = render(<PrivacyPage />);
  return container.textContent ?? '';
}

describe('/privacy — o que é prometido sobre a IA hospedada', () => {
  it('não promete, em nome do gateway ou do provedor, que eles não guardam nada', () => {
    // A frase removida era "Recebem a imagem, o áudio ou o texto da pergunta … e não guardam
    // nada". Ela é uma afirmação sobre a infraestrutura de outra empresa, com o padrão dela sendo
    // o oposto — nem verificável, nem verdadeira.
    expect(textoDaPagina()).not.toMatch(/não guardam nada/i);
  });

  it('a promessa de não haver bucket, disco ou coluna fica escopada ao Fatia', () => {
    // O item dizia "nem no Fatia, nem no serviço de IA". A primeira metade o repositório sustenta;
    // a segunda dependia de uma caixa marcada no painel da Cloudflare.
    const texto = textoDaPagina();

    expect(texto).toMatch(/não há bucket, não há disco, não há coluna/i);
    expect(texto).not.toMatch(/nem no serviço de IA/i);
  });

  it('nomeia o mecanismo que exige retenção zero, e não só a intenção', () => {
    // Os dois campos estão na página de propósito: é o que torna a afirmação conferível por quem lê
    // o código (`ZERO_RETENTION_ROUTING` no agente), e é o que some do repositório se alguém remover
    // a proteção. "Escolhemos fornecedores que não guardam" seria a mesma promessa dependente de
    // painel, escrita com outras palavras — o OpenRouter roteia para quem estiver disponível.
    const texto = textoDaPagina();

    expect(texto).toContain('zdr: true');
    expect(texto).toContain('data_collection: "deny"');
    expect(texto).toMatch(/recusada/i);
  });

  it('atribui o que acontece dentro do fornecedor à política dele, não a uma garantia nossa', () => {
    // O Fatia controla o pedido, não a máquina de quem o atende. A página pode afirmar o que o
    // pedido exige; o resto é declaração do fornecedor.
    expect(textoDaPagina()).toMatch(/quem responde é a política dele/i);
  });

  it('não esconde que o chat manda dados da conta ao modelo', () => {
    // "Você não vai junto" é verdade no reconhecimento por foto e falso no chat, que precisa ler a
    // conta para responder. Uma promessa escrita para um caminho não pode cobrir o outro.
    expect(textoDaPagina()).toMatch(/o que ele lê vai junto da conversa/i);
  });

  it('a recusa por configuração cobre o endereço, e não só o modelo', () => {
    // A lista de modelos não responde por `AI_BASE_URL`: qualquer proxy que fale o protocolo da
    // OpenAI serve um modelo já revisado. Enquanto o texto falava só de "modelos autorizados", ele
    // descrevia uma proteção mais forte do que a que existia.
    const texto = textoDaPagina();

    expect(texto).toMatch(/endereço/i);
    expect(texto).toMatch(/antes de qualquer byte sair/i);
  });
});

describe('/privacy — o que já era verdade e continua', () => {
  it('separa o caminho do Claude do usuário do caminho da IA hospedada', () => {
    // Sem os dois caminhos lado a lado, o titular não tem como saber para onde a foto dele vai.
    const texto = textoDaPagina();

    expect(texto).toMatch(/nunca chega até nós/i);

    // A asserção anterior era `/ainda não está disponível/`, e ela morreu quando a #139 entregou
    // o reconhecimento por foto: a frase virou falsa sobre o software, e só continuava verdadeira
    // sobre um deploy com `AGENT_BASE_URL` vazia. Política de privacidade descreve o que o
    // software faz, não o que uma instância desligou — senão ligar a variável torna o texto
    // mentiroso sem nada quebrar. O que se exige agora é a distinção que de fato importa ao
    // titular: na instância pública, o caminho hospedado depende de consentimento dele.
    expect(texto).toMatch(/consentimento específico seu/i);
    expect(texto).toMatch(/cada instância decide se a liga/i);
  });

  it('mostra a data da última atualização', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument();
  });
});
