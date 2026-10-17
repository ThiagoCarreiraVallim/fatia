import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { INVITE_UNAVAILABLE, InviteAccept, InviteSignedOut } from '@/components/community/invite';
import { getCurrentUser } from '@/lib/auth-server';
import { fetchInvitePreview } from '@/lib/invite-preview';

type Props = { params: Promise<{ token: string }> };

/**
 * O link de convite (`/c/<token>`). Abre sem login: quem ainda não tem conta vê
 * a comunidade e entra voltando para cá; quem tem escolhe o que compartilhar e
 * aceita.
 */
export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const [user, preview] = await Promise.all([getCurrentUser(), fetchInvitePreview(token)]);

  if (!preview) {
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-xl font-semibold">Convite indisponível</h1>
        <p className="text-sm text-muted-foreground">{INVITE_UNAVAILABLE}</p>
        <p className="text-sm text-muted-foreground">Peça um link novo a quem convidou você.</p>
        <Button asChild variant="outline">
          <Link href="/">Ir para o Fatia</Link>
        </Button>
      </div>
    );
  }

  return user ? (
    <InviteAccept token={token} preview={preview} />
  ) : (
    <InviteSignedOut token={token} preview={preview} />
  );
}
