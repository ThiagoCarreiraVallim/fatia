import { describeGrantGroup, parseGrantGroupArgs } from '../grant-group';
import { describeGrantPro, leArgumentos } from '../grant-pro';
import { describeGrantSeat, leArgumentosDoAssento } from '../grant-seat';
import {
  PRODUCTION_FLAG,
  describeDatabase,
  looksLikeProduction,
  runGuarded,
} from '../production-guard';

/**
 * Revisão da #386, item 8: os scripts que dão PRO sem cobrança
 * (`billing:grant-group`, `grant-pro`, `grant-seat`) nunca rodam em produção
 * por engano. Recusam com NODE_ENV=production ou banco com cara de produção,
 * a não ser com `--i-know-this-is-production`, e sempre mostram antes o que vão
 * mudar.
 */
const LOCAL = 'postgresql://fatia:fatia_dev@localhost:5432/fatia';
const CI = 'postgresql://postgres:postgres@localhost:5432/fatia_test';

describe('looksLikeProduction', () => {
  it('banco local de dev, de teste e do CI não é produção', () => {
    expect(looksLikeProduction({ DATABASE_URL: LOCAL, NODE_ENV: 'development' })).toBeNull();
    expect(looksLikeProduction({ DATABASE_URL: CI, NODE_ENV: 'test' })).toBeNull();
    expect(
      looksLikeProduction({ DATABASE_URL: 'postgresql://fatia:x@127.0.0.1:5432/fatia_t386' }),
    ).toBeNull();
    expect(
      looksLikeProduction({ DATABASE_URL: 'postgresql://fatia:x@postgres:5432/fatia' }),
    ).toBeNull();
  });

  it('NODE_ENV=production é produção', () => {
    expect(looksLikeProduction({ DATABASE_URL: LOCAL, NODE_ENV: 'production' })).toMatch(
      /NODE_ENV/,
    );
  });

  it('banco com "prod" no nome ou no host é produção', () => {
    expect(
      looksLikeProduction({ DATABASE_URL: 'postgresql://u:p@localhost:5432/fatia_prod' }),
    ).toMatch(/prod/);
    expect(
      looksLikeProduction({ DATABASE_URL: 'postgresql://u:p@db-prod.internal:5432/fatia' }),
    ).toMatch(/prod/);
  });

  it('banco fora da máquina é tratado como produção', () => {
    expect(looksLikeProduction({ DATABASE_URL: 'postgresql://u:p@10.0.0.7:5432/fatia' })).toMatch(
      /10\.0\.0\.7/,
    );
    expect(
      looksLikeProduction({ DATABASE_URL: 'postgresql://u:p@pg.fat.ia.br:5432/fatia' }),
    ).toMatch(/pg\.fat\.ia\.br/);
  });

  it('sem DATABASE_URL ou com URL ilegível, não arrisca', () => {
    expect(looksLikeProduction({})).toMatch(/DATABASE_URL/);
    expect(looksLikeProduction({ DATABASE_URL: 'não é url' })).toMatch(/DATABASE_URL/);
  });
});

describe('describeDatabase', () => {
  it('mostra host e banco, nunca a senha', () => {
    const d = describeDatabase('postgresql://fatia:segredo@localhost:5432/fatia_t386');
    expect(d).toBe('localhost:5432/fatia_t386');
    expect(d).not.toContain('segredo');
  });
});

describe('runGuarded', () => {
  const montar = (argv: string[], env: Record<string, string>) => {
    const linhas: string[] = [];
    const apply = jest.fn(async () => {
      linhas.push('APLICOU');
      return 'feito';
    });
    const run = () =>
      runGuarded({
        argv,
        env,
        plan: 'Criar cortesia PRO para a@b.c sem prazo',
        apply,
        log: (s) => linhas.push(s),
        error: (s) => linhas.push(`ERRO ${s}`),
      });
    return { linhas, apply, run };
  };

  it('em produção sem a flag: mostra o que mudaria, recusa e não toca no banco', async () => {
    const { linhas, apply, run } = montar(['a@b.c'], {
      DATABASE_URL: LOCAL,
      NODE_ENV: 'production',
    });
    expect(await run()).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(linhas.join('\n')).toContain('Criar cortesia PRO para a@b.c sem prazo');
    expect(linhas.join('\n')).toContain(PRODUCTION_FLAG);
  });

  it('banco remoto sem a flag também recusa', async () => {
    const { apply, run } = montar(['a@b.c'], {
      DATABASE_URL: 'postgresql://u:p@pg.fat.ia.br:5432/fatia',
    });
    expect(await run()).toBe(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('em produção com a flag: mostra o que muda e só então aplica', async () => {
    const { linhas, apply, run } = montar(['a@b.c', PRODUCTION_FLAG], {
      DATABASE_URL: LOCAL,
      NODE_ENV: 'production',
    });
    expect(await run()).toBe(0);
    expect(apply).toHaveBeenCalledTimes(1);
    const plano = linhas.findIndex((l) => l.includes('Criar cortesia PRO'));
    expect(plano).toBeGreaterThanOrEqual(0);
    expect(plano).toBeLessThan(linhas.indexOf('APLICOU'));
    expect(linhas).toContain('feito');
  });

  it('em dev: mostra o que muda e o banco, depois aplica', async () => {
    const { linhas, apply, run } = montar(['a@b.c'], { DATABASE_URL: LOCAL });
    expect(await run()).toBe(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(linhas[0]).toContain('Criar cortesia PRO');
    expect(linhas.join('\n')).toContain('localhost:5432/fatia');
    expect(linhas.join('\n')).not.toContain('fatia_dev');
  });

  it('erro ao aplicar sai com 1 e mostra a mensagem', async () => {
    const linhas: string[] = [];
    const code = await runGuarded({
      argv: [],
      env: { DATABASE_URL: LOCAL },
      plan: 'x',
      apply: () => Promise.reject(new Error('Nenhuma conta com o e-mail a@b.c')),
      log: (s) => linhas.push(s),
      error: (s) => linhas.push(`ERRO ${s}`),
    });
    expect(code).toBe(1);
    expect(linhas).toContain('ERRO Nenhuma conta com o e-mail a@b.c');
  });
});

describe('os três scripts', () => {
  it('a flag de produção não vira argumento posicional', () => {
    expect(parseGrantGroupArgs(['verao', PRODUCTION_FLAG]).slug).toBe('verao');
    expect(parseGrantGroupArgs([PRODUCTION_FLAG, 'verao']).slug).toBe('verao');
    expect(leArgumentos([PRODUCTION_FLAG, 'A@b.c']).email).toBe('a@b.c');
    expect(leArgumentosDoAssento(['a@b.c', PRODUCTION_FLAG, 'verao'])).toMatchObject({
      email: 'a@b.c',
      slug: 'verao',
    });
  });

  it('cada um descreve o que vai mudar', () => {
    expect(describeGrantGroup(parseGrantGroupArgs(['verao']))).toBe(
      'Dar PRO a todos os membros ativos da comunidade verao, sem data final',
    );
    expect(
      describeGrantGroup(
        parseGrantGroupArgs(['verao', '--until', '2026-11-30', '--program', 'Verão 21']),
      ),
    ).toBe(
      'Dar PRO a todos os membros ativos da comunidade verao até 2026-11-30 (fim do dia em São Paulo), programa "Verão 21"',
    );
    expect(describeGrantGroup(parseGrantGroupArgs(['verao', '--revoke']))).toBe(
      'Encerrar agora o PRO de todos os membros da comunidade verao',
    );
    expect(describeGrantPro(leArgumentos(['a@b.c']))).toBe(
      'Criar cortesia PRO (MANUAL) para a@b.c, sem prazo',
    );
    expect(describeGrantPro(leArgumentos(['a@b.c', '--days', '30']))).toBe(
      'Criar cortesia PRO (MANUAL) para a@b.c, por 30 dias',
    );
    expect(describeGrantPro(leArgumentos(['a@b.c', '--revoke']))).toBe(
      'Expirar as cortesias PRO ativas de a@b.c',
    );
    expect(describeGrantPro(leArgumentos(['a@b.c', '--purge']))).toBe(
      'Apagar todas as cortesias PRO de a@b.c, inclusive as expiradas',
    );
    expect(describeGrantSeat(leArgumentosDoAssento(['a@b.c', 'verao', '--seats', '5']))).toBe(
      'Dar um assento de cortesia a a@b.c na comunidade verao (pool de cortesia com pelo menos 5 assentos)',
    );
    expect(describeGrantSeat(leArgumentosDoAssento(['a@b.c', 'verao', '--purge']))).toBe(
      'Apagar os assentos de cortesia de a@b.c na comunidade verao',
    );
  });
});
