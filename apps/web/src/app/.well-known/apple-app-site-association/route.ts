import { NextResponse } from 'next/server';
import { appleAppSiteAssociation } from '@/lib/app-links';

/** Lido a cada pedido: o `APPLE_TEAM_ID` é do servidor, não do build. */
export const dynamic = 'force-dynamic';

export function GET() {
  const body = appleAppSiteAssociation(process.env.APPLE_TEAM_ID);
  if (!body) return new NextResponse(null, { status: 404 });
  return NextResponse.json(body);
}
