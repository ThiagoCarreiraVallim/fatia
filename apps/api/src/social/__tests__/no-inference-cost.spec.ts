import { readFileSync } from 'node:fs';
import { RAIZ_SOCIAL, fontesDeSocial } from './fontes';

/**
 * "Nada aqui pode gerar custo de inferência" (#161) virando teste.
 *
 * O grupo social é aquele em que **ninguém paga IA**. Enquanto não havia
 * cliente de inferência no repositório, a garantia era trivial — não havia o que
 * chamar. Com a #135/#136 mergeadas, `apps/api/src/ai/` existe, e a promessa
 * passou a ter como ser quebrada: bastaria um "resumo da semana do grupo" ou uma
 * "sugestão de post" para o grupo gratuito começar a custar dinheiro por
 * publicação.
 *
 * A checagem é sobre a **dependência**, não sobre a intenção: um comentário
 * dizendo "não usa IA" não impede nada.
 */

/**
 * O que `social/` pode importar de fora da própria pasta.
 *
 * Lista fechada, e não uma proibição só de `../ai/`: proibir por nome protege
 * contra o módulo que existe hoje, e o próximo cliente de inferência pode nascer
 * com outro nome. Aqui, dependência nova exige uma linha nesta lista — e a linha
 * é a conversa na revisão.
 */
const IMPORTS_PERMITIDOS = [
  '@nestjs/common',
  '../common/prisma.service',
  '../progress/helpers/date-tz',
];

/** Todo especificador de `import ... from '<x>'` do arquivo. */
function importsDe(conteudo: string): string[] {
  return [...conteudo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

describe('social não gera custo de inferência', () => {
  it('só importa o que está na lista — nada de IA entra por dependência', () => {
    const fontes = fontesDeSocial();

    // Sem isto, uma varredura que não achasse arquivo nenhum passaria calada.
    expect(fontes.length).toBeGreaterThanOrEqual(2);

    for (const arquivo of fontes) {
      const relativo = arquivo.replace(`${RAIZ_SOCIAL}/`, '');
      for (const especificador of importsDe(readFileSync(arquivo, 'utf8'))) {
        // Import da própria pasta é livre; o que precisa de justificativa é sair dela.
        if (especificador.startsWith('./')) continue;
        expect({
          relativo,
          especificador,
          permitido: IMPORTS_PERMITIDOS.includes(especificador),
        }).toEqual({ relativo, especificador, permitido: true });
      }
    }
  });

  it('nenhuma tool de social declara inferência hospedada', () => {
    // Hoje não há tool em `social/` (elas dependem da migration de feed e
    // desafio). A asserção nasce antes das tools de propósito: `hostedInference:
    // true` numa tool do grupo gratuito é a forma mais direta de a promessa da
    // issue morrer, e o guarda tem de estar de pé quando a primeira chegar.
    for (const arquivo of fontesDeSocial()) {
      expect(readFileSync(arquivo, 'utf8')).not.toMatch(/hostedInference:\s*true/);
    }
  });
});
