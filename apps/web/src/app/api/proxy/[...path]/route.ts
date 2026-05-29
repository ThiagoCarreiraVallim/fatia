import { NextRequest, NextResponse } from 'next/server';
import { getApiAccessToken } from '@/lib/auth-server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  const token = await getApiAccessToken();
  if (!token) {
    console.error(
      `[proxy] 401: sem access token para ${request.method} /api/${path.join('/')} ` +
        '— verifique LOGTO_AUDIENCE e refaça login (sign-out + sign-in).',
    );
    return NextResponse.json({ error: 'Unauthorized', source: 'proxy-no-token' }, { status: 401 });
  }

  const url = new URL(`${API_BASE}/api/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.delete('host');
  headers.delete('cookie');

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  const upstream = await fetch(url.toString(), init);

  // 204 (No Content) e 304 (Not Modified) NÃO podem ter body — o construtor de
  // Response lança "Invalid response status code 204" se passarmos um body, e o
  // handler vira 500. Isso quebrava TODOS os DELETEs (cancelar treino, remover
  // refeição/item/série/plano...), que respondem 204. Repassamos sem body.
  if (upstream.status === 204 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
