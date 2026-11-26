import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SESSION_ROUTES, demoSessionRequest } from '@fatia/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * O proxy da sessão de demonstração (#412): "Abrir no app como Ana Exemplo".
 *
 * Diferente do `/api/proxy`, não usa a sessão do Logto de quem está no
 * navegador: repassa só o token curto da demo (cabeçalho `x-fatia-demo`), só
 * GET e só as rotas que a tela Hoje da demo lê. A API confere de novo (o token
 * vale só em rota `@DemoReadable`); aqui ele não vira túnel para o resto.
 * Sem POST, PUT, PATCH nem DELETE exportados: o Next responde 405.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  const route = path.join('/');
  if (!DEMO_SESSION_ROUTES.includes(route)) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const req = demoSessionRequest(API_BASE, request.headers.get('x-fatia-demo') ?? '', route);
  if (!req) {
    return NextResponse.json({ error: 'Unauthorized', source: 'demo' }, { status: 401 });
  }

  const upstream = await fetch(req.url, {
    ...req.init,
    signal: request.signal,
    cache: 'no-store',
  });
  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
