import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DEMO_READABLE_KEY } from '../../common/decorators/demo-readable.decorator';
import { DEMO_TOKEN_PREFIX } from '../../common/demo';
import type { DemoSessionService } from '../demo-session.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import type { JwtValidationService } from '../jwt-validation.service';
import type { UserProvisioningService } from '../user-provisioning.service';

type Ctor = abstract new (...args: never[]) => unknown;

/** Todos os controllers do app, andando pelos `imports` dos módulos a partir do `AppModule`. */
function allControllers(): Ctor[] {
  const vistos = new Set<unknown>();
  const out = new Set<Ctor>();
  const visita = (m: unknown) => {
    const mod = (m as { module?: unknown })?.module ?? m;
    if (!mod || vistos.has(mod)) return;
    vistos.add(mod);
    const controllers =
      (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod as object) as Ctor[]) ?? [];
    controllers.forEach((c) => out.add(c));
    const imports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod as object) as unknown[]) ?? [];
    const dinamicos = ((m as { imports?: unknown[] })?.imports ?? []) as unknown[];
    [...imports, ...dinamicos].forEach(visita);
  };
  visita(AppModule);
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

  it('só estas leituras aceitam a sessão de demo, todas GET e do próprio usuário', () => {
    expect(demoReadableRoutes()).toEqual([
      'GET /dashboard/today',
      'GET /goals',
      'GET /progress/weight',
      'GET /users/me',
      'GET /users/me/inbox',
      'GET /users/me/onboarding/first-steps',
      'GET /water-logs',
    ]);
  });
});
