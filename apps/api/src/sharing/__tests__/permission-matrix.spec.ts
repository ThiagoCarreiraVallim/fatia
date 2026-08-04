import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GroupRole, ShareScope } from '@prisma/client';
import {
  can,
  canReceiveLink,
  canWhilePending,
  GROUP_ACTIONS,
  GROUP_PERMISSIONS,
  ROLES_ELIGIBLE_FOR_LINK,
  type GroupAction,
} from '../permissions';
import { GROUP_ACTION_KEY, SELF_ONLY_KEY } from '../decorators/require-group-action.decorator';

/**
 * Guarda da matriz de papéis (issue #156).
 *
 * `docs/PERMISSIONS.md` é documento **parseável**, não prosa: este spec lê as
 * duas tabelas de lá e as confronta com `permissions.ts` nos dois sentidos.
 * Mesmo mecanismo de `tool-catalog.spec.ts` — o repositório já provou que
 * funciona, e o modo de falha que ele cobre é o pior de todos: a doc dizendo uma
 * coisa, o código fazendo outra, e ninguém notando porque as duas parecem
 * certas isoladamente.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');
const DOC = resolve(REPO_ROOT, 'docs/PERMISSIONS.md');
const SHARING_SRC = resolve(__dirname, '..');

const doc = readFileSync(DOC, 'utf8');

/** Células de uma linha de tabela markdown, já sem os pipes das pontas. */
function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((celula) => celula.trim().replace(/`/g, ''));
}

/** Linhas de dados da tabela que vem logo depois do cabeçalho `##`/`### <titulo>`. */
function tabelaDaSecao(titulo: string): { header: string[]; rows: string[][] } {
  const secao = doc.split(new RegExp(`^#{2,3} ${titulo}$`, 'm'))[1];
  if (secao === undefined) throw new Error(`seção "${titulo}" não existe em docs/PERMISSIONS.md`);

  const linhas = secao.split('\n');
  const inicio = linhas.findIndex((linha) => linha.trim().startsWith('|'));
  if (inicio === -1) throw new Error(`seção "${titulo}" não tem tabela`);

  const bloco: string[] = [];
  for (let i = inicio; i < linhas.length && linhas[i].trim().startsWith('|'); i++) {
    bloco.push(linhas[i]);
  }

  const header = celulas(bloco[0]);
  // bloco[1] é o separador `| --- | --- |`.
  const rows = bloco.slice(2).map(celulas);
  return { header, rows };
}

const administrativas = tabelaDaSecao('Ações administrativas \\(papel decide\\)');
const leitura = tabelaDaSecao('Leitura de dado de titular \\(papel NÃO decide — vínculo decide\\)');
const pendente = tabelaDaSecao('Status da associação \\(papel só vale com associação viva\\)');

describe('matriz de papéis (docs/PERMISSIONS.md × permissions.ts)', () => {
  it('parseia as duas tabelas da doc', () => {
    // Sanidade: um parser quebrado produziria listas vazias, e todo `expect` de
    // igualdade abaixo passaria comparando nada com nada.
    expect(administrativas.rows.length).toBeGreaterThan(5);
    expect(leitura.rows.length).toBeGreaterThan(1);
    expect(administrativas.header).toEqual([
      'Ação',
      GroupRole.OWNER,
      GroupRole.PROFESSIONAL,
      GroupRole.CREATOR,
      GroupRole.MEMBER,
    ]);
  });

  it('não tem ação na doc que o código desconheça, nem o contrário', () => {
    const naDoc = administrativas.rows.map((row) => row[0]).sort();
    expect(naDoc).toEqual([...GROUP_ACTIONS].sort());
  });

  const casos = administrativas.rows.flatMap((row) =>
    administrativas.header.slice(1).map((papel, i) => ({
      acao: row[0] as GroupAction,
      papel: papel as GroupRole,
      permitido: row[i + 1] === 'sim',
      celula: row[i + 1],
    })),
  );

  it.each(casos)('$acao × $papel = $celula', ({ acao, papel, permitido, celula }) => {
    // A célula só pode ser "sim" ou "não": um "talvez" (ou um typo) viraria
    // `false` em silêncio e a doc passaria a prometer menos do que o código faz.
    expect(['sim', 'não']).toContain(celula);
    expect(can(papel, acao)).toBe(permitido);
  });

  it('não concede nada a papel fora da linha, nem por acúmulo em outro grupo', () => {
    // `can` é função pura sobre papel e ação: não existe parâmetro por onde
    // "ser OWNER de outro grupo", "ser ADMIN da plataforma" ou "ter uma segunda
    // membership" entre na conta. Este caso fixa isso como contrato — se um dia
    // a assinatura ganhar um terceiro argumento, ele quebra e a discussão volta
    // à mesa em vez de acontecer por inércia.
    expect(can.length).toBe(2);

    for (const [acao, papeis] of Object.entries(GROUP_PERMISSIONS) as Array<
      [GroupAction, readonly GroupRole[]]
    >) {
      const negados = Object.values(GroupRole).filter((papel) => !papeis.includes(papel));
      for (const papel of negados) {
        expect([acao, papel, can(papel, acao)]).toEqual([acao, papel, false]);
      }
    }
  });

  it('a tabela de associação pendente cobre todas as ações, sem sobrar nem faltar', () => {
    expect(pendente.header).toEqual(['Ação', 'Pendente (INVITED)']);
    expect(pendente.rows.map((row) => row[0]).sort()).toEqual([...GROUP_ACTIONS].sort());
  });

  it.each(pendente.rows)('%s com associação pendente = %s', (acao, celula) => {
    expect(['sim', 'não']).toContain(celula);
    expect([acao, canWhilePending(acao as GroupAction)]).toEqual([acao, celula === 'sim']);
  });

  it('cobre todo escopo do enum na tabela de leitura', () => {
    // O risco que este caso fecha: `ShareScope` ganha um valor, ninguém liga a
    // leitura correspondente, e o toggle na UI não protege nada.
    expect(leitura.rows.map((row) => row[0]).sort()).toEqual(Object.values(ShareScope).sort());
  });

  it('só PROFESSIONAL pode receber vínculo, em todo escopo', () => {
    for (const [escopo, podem, nunca] of leitura.rows) {
      const listados = podem.split(',').map((p) => p.trim());
      expect([escopo, listados]).toEqual([escopo, [...ROLES_ELIGIBLE_FOR_LINK]]);

      // A coluna "quem NUNCA recebe" tem de ser o complemento exato, mais o
      // `ADMIN` de plataforma — que não é papel de grupo e por isso não sairia
      // do enum sozinho. Escrever "OWNER, MEMBER" e esquecer `CREATOR` daria uma
      // doc que parece completa e deixa um papel sem resposta.
      const complemento = Object.values(GroupRole).filter((papel) => !canReceiveLink(papel));
      expect([escopo, nunca.split(',').map((p) => p.trim())]).toEqual([
        escopo,
        [...complemento, 'ADMIN'],
      ]);
    }
  });
});

describe('todo método de controller de sharing declara a camada em que vive', () => {
  /**
   * A matriz certa com o guard no lugar errado é falha silenciosa: `can()`
   * correto, controller sem o decorator, rota aberta. Aqui cada método público
   * precisa declarar `@RequireGroupAction` **ou** `@SelfOnly` — sem terceiro
   * estado, para que "esqueci" não seja indistinguível de "é do próprio dono".
   */
  const controllers = readdirSync(SHARING_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.controller.ts'))
    .map((entry) => join(SHARING_SRC, entry));

  it('encontra os controllers de sharing', () => {
    expect(controllers.length).toBeGreaterThan(1);
  });

  it.each(controllers)('%s', (file) => {
    // Varredura por linha, e não um regex sobre o arquivo inteiro: um
    // `[\s\S]*?` entre o verbo e a assinatura casa com qualquer coisa, inclusive
    // com o pedaço de linha que vem ANTES do decorator que se queria encontrar
    // — e o teste passa a reprovar rota bem anotada, ou pior, a aprovar rota mal
    // anotada, dependendo de onde a preguiça do quantificador parar.
    const linhas = readFileSync(file, 'utf8').split('\n');
    const VERBO = /^\s*@(?:Get|Post|Put|Patch|Delete)\(/;
    const DECLARACAO = /^\s*@(?:RequireGroupAction\(|SelfOnly\()/;
    /** Fim do bloco de decorators: a linha da assinatura do método. */
    const ASSINATURA = /^\s{2}(?:async\s+)?[\w]+\s*\(/;

    const semDeclaracao: string[] = [];
    linhas.forEach((linha, i) => {
      if (!VERBO.test(linha)) return;

      let declarado = false;
      for (let j = i + 1; j < linhas.length && !ASSINATURA.test(linhas[j]); j++) {
        if (DECLARACAO.test(linhas[j])) declarado = true;
      }
      if (!declarado) semDeclaracao.push(`${file}:${i + 1} ${linha.trim()}`);
    });

    // Sanidade: sem rota encontrada, a lista vazia acima não prova nada.
    expect(linhas.filter((linha) => VERBO.test(linha)).length).toBeGreaterThan(0);
    expect(semDeclaracao).toEqual([]);
  });

  it('só usa ações que existem no mapa', () => {
    const usadas = controllers.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/@RequireGroupAction\('([^']+)'\)/g)].map(
        (m) => m[1],
      ),
    );

    expect(usadas.length).toBeGreaterThan(0);
    expect(usadas.filter((acao) => !GROUP_ACTIONS.includes(acao as GroupAction))).toEqual([]);
  });

  it('o decorator não escapa de sharing/, billing/ e insights/', () => {
    // `@RequireGroupAction` numa rota de domínio faria um service de domínio
    // depender de grupo — o oposto do que a ADR 014 decidiu.
    //
    // `insights/` entra na lista com a #159: o painel agregado é superfície de
    // administração de grupo, como billing, e não leitura de dado de titular —
    // não há indivíduo do outro lado, por construção. A lista é curta de
    // propósito; crescer nela é a discussão, não a solução.
    const API_SRC = resolve(SHARING_SRC, '..');
    const PERMITIDOS = ['sharing/', 'billing/', 'insights/'];
    const fora = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.ts'))
      .filter((entry) => !PERMITIDOS.some((prefixo) => entry.startsWith(prefixo)))
      .filter((entry) => /@RequireGroupAction\(/.test(readFileSync(join(API_SRC, entry), 'utf8')));

    expect(fora).toEqual([]);
  });

  it('todo arquivo que declara @RequireGroupAction registra o GroupRoleGuard', () => {
    // O decorator sozinho **não faz nada**: ele só grava metadata, e quem lê é o
    // guarda. Controller anotado sem `@UseGuards(GroupRoleGuard)` é rota aberta
    // com aparência de rota protegida — e o caso acima, que confere o decorator,
    // aprova os dois igualmente. Este é o outro lado do par.
    //
    // A varredura é do `src` inteiro, e não só de `sharing/`: a próxima ação da
    // matriz sem rota (`insights.read`, `billing.*`) nasce noutro módulo, e é
    // exatamente ali que o `@UseGuards` seria esquecido.
    const API_SRC = resolve(SHARING_SRC, '..');
    const arquivos = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
      .map((entry) => ({ entry, conteudo: readFileSync(join(API_SRC, entry), 'utf8') }))
      .filter(({ conteudo }) => conteudo.includes('@RequireGroupAction('));

    // Sanidade: sem arquivo anotado encontrado, a lista vazia abaixo não prova
    // nada — foi assim que este caso nasceu inútil na primeira versão.
    expect(arquivos.map(({ entry }) => entry)).toContain('sharing/sharing.controller.ts');

    // `@UseGuards(...)` com o guarda dentro dos parênteses, e não a menção solta
    // ao identificador: procurar `GroupRoleGuard` no arquivo inteiro casaria com
    // a linha de `import`, que continua lá depois de o `@UseGuards` ser apagado.
    const REGISTRO = /@UseGuards\([^)]*\bGroupRoleGuard\b[^)]*\)/;
    const semGuarda = arquivos
      .filter(({ conteudo }) => !REGISTRO.test(conteudo))
      .map(({ entry }) => entry);

    expect(semGuarda).toEqual([]);
  });

  it('as chaves de metadata não colidem', () => {
    expect(GROUP_ACTION_KEY).not.toBe(SELF_ONLY_KEY);
  });
});
