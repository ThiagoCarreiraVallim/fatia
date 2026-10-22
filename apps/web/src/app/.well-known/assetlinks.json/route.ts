import { NextResponse } from 'next/server';
import { androidAssetLinks } from '@/lib/app-links';

/** Lido a cada pedido: o `ANDROID_CERT_SHA256` é do servidor, não do build. */
export const dynamic = 'force-dynamic';

export function GET() {
  const body = androidAssetLinks(process.env.ANDROID_CERT_SHA256);
  if (!body) return new NextResponse(null, { status: 404 });
  return NextResponse.json(body);
}
