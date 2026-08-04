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

/**
 * Todo especificador de dependência do arquivo, em qualquer das formas que o
 * TypeScript aceita.
 *
 * Fechar só por `from` com aspas simples deixava quatro portas abertas contra um
 * módulo que já existe no repositório: import de efeito colateral (sem `from`),
 * import dinâmico, `require` e aspas duplas. O import dinâmico é o que mais
 * importa — é exatamente assim que um "resumo da semana do grupo" entraria
 * dentro de um método, sem tocar no topo do arquivo, que é onde a revisão olha.
 */
const PADROES_DE_DEPENDENCIA = [
  /\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'y' | export * from 'y'
  /\bimport\s*['"]([^'"]+)['"]/g, // import 'y'  (efeito colateral)
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g, // await import('y')
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g, // require('y')
];

function importsDe(conteudo: string): string[] {
  return PADROES_DE_DEPENDENCIA.flatMap((padrao) =>
    [...conteudo.matchAll(padrao)].map((m) => m[1]),
  );
}

/**
 * Dependências do conteúdo que saem da pasta **e** não estão na lista.
 *
 * É esta função — e não só o extrator — que o guarda aplica sobre os fontes de
 * verdade. Ter uma função só é o que permite provar o vermelho com um fonte de
 * mentira: exercitar o guarda inteiro mexendo em `scoreboard.service.ts` exigiria
 * deixar um import de IA no repositório para o teste ficar verde.
 */
function foraDaLista(conteudo: string): string[] {
  return importsDe(conteudo).filter(
    // Import da própria pasta é livre; o que precisa de justificativa é sair dela.
    (especificador) =>
      !especificador.startsWith('./') && !IMPORTS_PERMITIDOS.includes(especificador),
  );
}

describe('social não gera custo de inferência', () => {
  it.each([
    ["import { AI_MODEL_PRICING } from '../ai/ai-pricing';", 'import nomeado'],
    ['import { AI_MODEL_PRICING } from "../ai/ai-pricing";', 'aspas duplas'],
    ["import '../ai/ai-pricing';", 'efeito colateral, sem `from`'],
    ["const ia = await import('../ai/ai-pricing');", 'import dinâmico dentro do método'],
    ["void require('../ai/ai-pricing');", 'require'],
  ])('o guarda pega %s (%s)', (linha) => {
    // Enquanto o extrator fechava só por `from` com aspas simples, as quatro
    // últimas formas passavam por baixo dele: `tsc`, `eslint` e os testes de
    // `social/` ficavam verdes com `apps/api/src/ai/ai-pricing` importado dentro
    // de `recompute`. O import dinâmico é o que mais importa — é exatamente
    // assim que um cliente de inferência é plugado sob demanda, sem tocar no
    // topo do arquivo, que é onde a revisão olha.
    expect(foraDaLista(linha)).toEqual(['../ai/ai-pricing']);
  });

  it('só importa o que está na lista — nada de IA entra por dependência', () => {
    const fontes = fontesDeSocial();

    // Sem isto, uma varredura que não achasse arquivo nenhum passaria calada.
    expect(fontes.length).toBeGreaterThanOrEqual(2);

    for (const arquivo of fontes) {
      const relativo = arquivo.replace(`${RAIZ_SOCIAL}/`, '');
      expect({ relativo, fora: foraDaLista(readFileSync(arquivo, 'utf8')) }).toEqual({
        relativo,
        fora: [],
      });
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
