import { headers } from 'next/headers';
import { isTeamInvite } from '@fatia/api-client';
import { brandStyle } from '@/components/community/brand-cover';
import { InviteQr } from '@/components/org/invite-qr';
import { fetchInvitePreview } from '@/lib/invite-preview';
import { PrintButton } from './print-button';

type Props = { params: Promise<{ token: string }> };

/**
 * O cartaz A4 do QR de convite (#372, prancha Onb-C4): o nome da comunidade na
 * cor dela, o QR do link e "Aponte a câmera para entrar", para a recepção. O
 * nome do QR ("recepção") é da equipe e não sai no cartaz. Abre sem login,
 * como o próprio link (`/c/<token>`); convite de equipe não vira cartaz.
 */
export default async function PosterPage({ params }: Props) {
  const { token } = await params;
  const preview = await fetchInvitePreview(token);
  if (!preview || isTeamInvite(preview.role)) {
    return (
      <main className="mx-auto max-w-md px-5 pt-16 text-center">
        <h1 className="text-xl font-semibold">Convite indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gere um QR novo em Convites, no painel da comunidade.
        </p>
      </main>
    );
  }
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const url = `${proto}://${host}/c/${token}`;

  return (
    <main className="mx-auto flex max-w-[210mm] flex-col items-center gap-6 px-5 py-8 print:p-0">
      <style>{'@page { size: A4; margin: 0 }'}</style>
      <section
        style={brandStyle(preview.group.brandColor)}
        className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-[6%] rounded-card bg-[linear-gradient(160deg,hsl(var(--brand)),hsl(var(--brand)/0.7))] p-[8%] text-center text-brand-foreground [print-color-adjust:exact] print:rounded-none"
      >
        <h1 className="font-display text-[clamp(28px,6vw,56px)] font-extrabold leading-tight">
          {preview.group.name} no Fatia
        </h1>
        <div className="w-[62%] rounded-[8%] bg-white p-[5%]">
          <InviteQr url={url} size={512} />
        </div>
        <p className="font-display text-[clamp(20px,4vw,36px)] font-bold">
          Aponte a câmera para entrar
        </p>
      </section>
      <PrintButton />
    </main>
  );
}
