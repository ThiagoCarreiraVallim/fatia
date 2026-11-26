import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEMO_READABLE_KEY } from '../../common/decorators/demo-readable.decorator';
import { DEMO_TOKEN_PREFIX } from '../../common/demo';
import type { DemoSessionService } from '../demo-session.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import type { JwtValidationService } from '../jwt-validation.service';
import type { UserProvisioningService } from '../user-provisioning.service';

type Ctor = abstract new (...args: never[]) => unknown;

/**
 * Todos os controllers do app, lidos dos arquivos `*.controller.ts`. Não parte do
 * `AppModule`: importá-lo roda o `ConfigModule.forRoot`, que valida o ambiente e
 * derruba o worker do jest no CI, onde não há variável do Logto.
 */
function allControllers(): Ctor[] {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : files(p);
      return e.name.endsWith('.controller.ts') ? [p] : [];
    });
  const out = new Set<Ctor>();
  for (const f of files(resolve(__dirname, '..', '..'))) {
    for (const exported of Object.values(require(f) as Record<string, unknown>)) {
      if (typeof exported === 'function' && Reflect.hasMetadata(PATH_METADATA, exported)) {
        out.add(exported as unknown as Ctor);
      }
    }
  }
  return [...out];
}

/** "GET /users/me" de cada handler marcado com `@DemoReadable`. */
function demoReadableRoutes(): string[] {
  const rotas: string[] = [];
  for (const c of allControllers()) {
    const base = String(Reflect.getMetadata(PATH_METADATA, c) ?? '').replace(/^\/|\/$/g, '');
    const proto = (c as unknown as { prototype: Record<string, unknown> }).prototype;
    for (const nome of Object.getOwnPropertyNames(proto)) {
      const handler = proto[nome];
      if (typeof handler !== 'function' || nome === 'constructor') continue;
      const marcado =
        Reflect.getMetadata(DEMO_READABLE_KEY, handler) ??
        Reflect.getMetadata(DEMO_READABLE_KEY, c);
      if (!marcado) continue;
      const metodo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(/^\/|\/$/g, '');
      rotas.push(`${metodo} /${[base, sub].filter(Boolean).join('/')}`);
    }
  }
  return rotas.sort();
}

/**
 * A sessão "Abrir no app como Ana Exemplo" (#412) no guard de toda rota: o
 * token de demo só vale em `GET` das leituras do Hoje, resolve só para a aluna
 * fictícia, nunca escreve e nunca chama a IA.
 */
describe('sessão de demonstração no guard (#412)', () => {
  const ANA = { id: 'ana-exemplo', email: 'ana@demo.fatia.invalid', role: 'USER', timezone: 'UTC' };
  const authenticate = jest.fn().mockResolvedValue(ANA);
  const verify = jest.fn().mockRejectedValue(new UnauthorizedException('jwt inválido'));
  const demo = { authenticate } as unknown as DemoSessionService;
  const token = `${DEMO_TOKEN_PREFIX}${'a'.repeat(32)}`;

  function run(opts: { readable: boolean; method: string }) {
    const reflector = {
      getAllAndOverride: (key: string) => (key === DEMO_READABLE_KEY ? opts.readable : false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(
      reflector,
      { verify } as unknown as JwtValidationService,
      { provision: jest.fn() } as unknown as UserProvisioningService,
      demo,
    );
    const req = {
      method: opts.method,
      headers: { authorization: `Bearer ${token}`, host: 'api.test' },
    } as { method: string; headers: Record<string, string>; user?: { id: string } };
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader() {} }) }),
    } as unknown as ExecutionContext;
    return { req, result: guard.canActivate(ctx) };
  }

  beforeEach(() => {
    authenticate.mockClear();
    verify.mockClear();
  });

  it('numa leitura do Hoje, a sessão é a da Ana e nunca passa pelo Logto', async () => {
    const { req, result } = run({ readable: true, method: 'GET' });
    await expect(result).resolves.toBe(true);
    expect(req.user?.id).toBe(ANA.id);
    expect(authenticate).toHaveBeenCalledWith(token);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'não escreve: %s com token de demo é 403, mesmo em rota de leitura',
    async (method) => {
      await expect(run({ readable: true, method }).result).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('fora das leituras do Hoje (chat, IA, cobrança, push...) é 403', async () => {
    await expect(run({ readable: false, method: 'GET' }).result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run({ readable: false, method: 'POST' }).result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('token vencido ou apagado é 401', async () => {
    authenticate.mockRejectedValueOnce(new UnauthorizedException('vencida'));
    await expect(run({ readable: true, method: 'GET' }).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('só as duas leituras do Hoje da Ana aceitam a sessão de demo', () => {
    // O que a web e o app pedem (`DEMO_SESSION_ROUTES`), e nada além: o
    // primeiros-passos, por exemplo, grava `firstStepsDoneAt` num GET.
    expect(demoReadableRoutes()).toEqual(['GET /dashboard/today', 'GET /users/me']);
  });
});
