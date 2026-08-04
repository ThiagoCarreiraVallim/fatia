import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GroupType } from '@fatia/db';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';
import { fecharCiclo, type CicloDb } from '../close-cycle';

/**
 * O guarda da regra que a #158 chama de inviolável: **o aluno nunca vê
 * cobrança, em caminho nenhum.**
 *
 * A regra é fácil de respeitar hoje e fácil de quebrar em seis meses, por
 * gentileza: uma tool `check_my_subscription` "para o aluno saber se a academia
 * está em dia", uma coluna "último acesso" na fatura "para a academia auditar".
 * Cada uma parece um detalhe de UX no dia em que é escrita. Este arquivo as
 * transforma em teste vermelho.
 *
 * São quatro invariantes, e cada um fecha uma porta diferente:
 * 1. nenhuma tool MCP menciona cobrança — o Claude do aluno não tem o assunto;
 * 2. nenhum controller fora de `billing/` conhece cobrança;
 * 3. a linha da fatura não carrega sinal comportamental individual;
 * 4. a contagem de cabeças não passa pela porta de leitura profissional.
 */

const API_SRC = resolve(__dirname, '../..');

/**
 * O vocabulário de cobrança, com e sem acento, em português e em inglês.
 *
 * Ampla de propósito: um guarda que só conhece a grafia que o autor de hoje usou
 * não é guarda. Se alguma palavra daqui aparecer legitimamente numa superfície
 * de aluno, o certo é discutir a exceção na PR — não afrouxar a lista em
 * silêncio.
 */
const VOCABULARIO_DE_COBRANCA =
  /\b(cobran[çc]as?|faturas?|faturamento|mensalidade|pagamentos?|assinaturas?|inadimpl\w*|invoices?|billing|charges?|payments?|subscriptions?|checkout|pre[çc]os?|prices?|paywall)\b/i;

function arquivosPorSufixo(sufixo: string): string[] {
  return readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entrada) => entrada.endsWith(sufixo))
    .map((entrada) => join(API_SRC, entrada))
    .sort();
}

/**
 * Instancia as tools com dependências vazias, como o `tool-catalog.spec.ts` já
 * faz: os construtores só atribuem campo, e é o **contrato servido** — nome,
 * título, descrição e schema — que interessa aqui, não o comportamento.
 */
function carregaTools(): Array<{ file: string; tool: McpToolDef }> {
  const carregadas: Array<{ file: string; tool: McpToolDef }> = [];

  for (const file of arquivosPorSufixo('.tool.ts')) {
    const mod = require(file) as Record<string, unknown>;

    for (const exportado of Object.values(mod)) {
      if (typeof exportado !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exportado)) continue;

      const Ctor = exportado as new (...args: never[]) => McpToolDef;
      const deps = Array.from({ length: Ctor.length }, () => undefined) as never[];
      carregadas.push({ file, tool: new Ctor(...deps) });
    }
  }

  return carregadas;
}

/**
 * Tira comentário do fonte antes de procurar chamada.
 *
 * Sem isto, o próprio comentário que **explica** por que a contagem não chama
 * `assertReadable` faria o guarda acusar a chamada que ele proíbe — a mesma
 * armadilha da asserção que casa com a linha de `import`. Um guarda que obriga a
 * apagar a explicação é um guarda que perde a explicação.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

/** Tudo que o Claude enxerga de uma tool: nome, título, descrição e schema. */
function superficieServida(tool: McpToolDef): string {
  // Os dois `any` são o mesmo contorno do `tool-catalog.spec.ts`: a assinatura
  // genérica de `z.object` sobre o schema de todas as tools estoura o
  // instanciador de tipos do TypeScript.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = zodToJsonSchema(z.object(tool.inputSchema as any) as any);
  return [tool.name, tool.title, tool.description, JSON.stringify(schema)].join('\n');
}

const tools = carregaTools();

describe('o aluno nunca vê cobrança', () => {
  it('carregou o catálogo de tools (senão o guarda passaria vazio)', () => {
    // Sem esta asserção, um erro de varredura devolveria zero tools e todos os
    // casos abaixo ficariam verdes sem conferir nada.
    expect(tools.length).toBeGreaterThan(50);
  });

  it.each(tools.map(({ file, tool }) => [tool.name, file] as const))(
    'a tool %s não menciona cobrança',
    (nome) => {
      const tool = tools.find((t) => t.tool.name === nome)!.tool;
      const encontrado = superficieServida(tool).match(VOCABULARIO_DE_COBRANCA);

      expect(encontrado?.[0] ?? null).toBeNull();
    },
  );

  it('nenhum controller fora de billing/ conhece cobrança', () => {
    const infratores = arquivosPorSufixo('.controller.ts')
      .filter((file) => !file.includes('/billing/'))
      .filter((file) =>
        /billingInvoice|groupSubscription|BillingProvider|fecharCiclo|AsaasProvider/.test(
          readFileSync(file, 'utf8'),
        ),
      );

    expect(infratores).toEqual([]);
  });

  it('nenhum módulo de domínio do aluno importa cobrança', () => {
    // O caminho do aluno não consulta cobrança nem para decidir se atende: é
    // isso que impede a inadimplência da academia de virar bloqueio dele por
    // omissão. A degradação é leitura de `aiTier`, e mora em quem oferece IA.
    const dominiosDoAluno = ['/nutrition/', '/workout/', '/progress/', '/goals/', '/users/'];

    const infratores = arquivosPorSufixo('.ts')
      .filter((file) => dominiosDoAluno.some((dominio) => file.includes(dominio)))
      .filter((file) => /from '.*billing\//.test(readFileSync(file, 'utf8')));

    expect(infratores).toEqual([]);
  });

  it('a contagem de cabeças não passa pela porta de leitura profissional', () => {
    // Contar não é ler. Passar por `assertReadable` diria que o dono da academia
    // está lendo dado do aluno — e ele não está, nem pode.
    for (const arquivo of ['active-student.ts', 'close-cycle.ts']) {
      const codigo = semComentarios(readFileSync(resolve(__dirname, '..', arquivo), 'utf8'));

      expect(codigo).not.toMatch(/ProfessionalAccess|professional-access/);
      expect(codigo).not.toMatch(/assertReadable/);
    }
  });

  it('a linha da fatura carrega quatro campos, e nenhum é comportamento', async () => {
    const db = {
      group: {
        findUnique: jest.fn(async () => ({
          id: 'g1',
          type: GroupType.SPONSORED,
          owner: { timezone: 'America/Sao_Paulo' },
        })),
      },
      groupMembership: {
        findMany: jest.fn(async () => [
          {
            id: 'm1',
            userId: 'u1',
            joinedAt: new Date('2026-01-01T12:00:00Z'),
            leftAt: null,
            user: { name: 'Ana' },
          },
        ]),
      },
      meal: { findMany: jest.fn(async () => [{ userId: 'u1' }]) },
      workoutSession: { findMany: jest.fn(async () => []) },
      weightLog: { findMany: jest.fn(async () => []) },
      stepLog: { findMany: jest.fn(async () => []) },
      waterLog: { findMany: jest.fn(async () => []) },
      goal: { findMany: jest.fn(async () => []) },
    };

    const fatura = await fecharCiclo(
      db as unknown as CicloDb,
      { groupId: 'g1', tier: 'basico', pricePerStudentCents: 1500, cycleDay: 1 },
      new Date('2026-08-03T12:00:00Z'),
    );

    // A asserção é sobre a saída de verdade, não sobre o tipo: um campo novo
    // acrescentado ao objeto aparece aqui mesmo que ninguém atualize a interface.
    expect(Object.keys(fatura.lines[0]).sort()).toEqual([
      'amountCents',
      'displayName',
      'membershipId',
      'proRataMilli',
    ]);

    // E nada de identidade de usuário: `userId` é a chave que correlacionaria a
    // mesma pessoa entre duas academias.
    expect(JSON.stringify(fatura)).not.toContain('u1');
    expect(JSON.stringify(fatura)).not.toMatch(
      /lastActivity|ultimaAtividade|lastSeen|sessionCount|diasSem|streak|activeDays/i,
    );
  });
});
