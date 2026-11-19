import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  fetchAnnouncementSubscription,
  setAnnouncementSubscription,
} from '@/lib/announcement-subscription';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'E-mail de comunicados — Fatia',
  robots: { index: false, follow: false },
};

/** O botão da página: só ele muda alguma coisa (o GET nunca descadastra). */
async function change(formData: FormData) {
  'use server';
  const t = String(formData.get('t') ?? '');
  const subscribed = formData.get('subscribed') === 'true';
  const r = await setAnnouncementSubscription(t, subscribed);
  redirect(
    `/descadastro?${new URLSearchParams({ t, ...(r ? { ok: subscribed ? 'on' : 'off' } : { erro: '1' }) })}`,
  );
}

/**
 * `/descadastro?t=…` (#398): o link do rodapé do e-mail de comunicado. Sem
 * login. Abrir o link não descadastra (leitores de link dos provedores abrem
 * sozinhos); a pessoa confirma no botão. Só o e-mail de comunicados muda: as
 * notificações no app seguem a preferência de Você › Notificações.
 */
export default async function AnnouncementUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; ok?: string; erro?: string }>;
}) {
  const { t = '', ok, erro } = await searchParams;
  const estado = await fetchAnnouncementSubscription(t);

  if (!estado) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="font-display text-2xl font-bold">Link inválido</h1>
        <p className="text-muted-foreground">
          Este link de descadastro não vale. Use o link do e-mail mais recente ou entre no Fatia e
          ajuste em Você › Notificações.
        </p>
        <Link href="/you" className="text-sm font-semibold underline">
          Abrir minhas notificações
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-2xl font-bold">E-mail de comunicados</h1>
      {erro && (
        <p role="alert" className="text-sm text-danger">
          Não deu para salvar agora. Tente de novo.
        </p>
      )}
      {ok === 'off' && (
        <p role="status" className="text-sm font-semibold">
          Pronto: você não recebe mais comunicados por e-mail.
        </p>
      )}
      {ok === 'on' && (
        <p role="status" className="text-sm font-semibold">
          Pronto: os comunicados voltam a chegar por e-mail.
        </p>
      )}
      <p className="text-muted-foreground">
        {estado.subscribed
          ? 'Hoje você recebe por e-mail os comunicados das suas comunidades. Quer parar?'
          : 'Você não recebe comunicados por e-mail. Eles continuam no mural e, se você deixou ligado, nas notificações do app.'}
      </p>
      <form action={change}>
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="subscribed" value={estado.subscribed ? 'false' : 'true'} />
        <Button type="submit" variant={estado.subscribed ? 'default' : 'outline'}>
          {estado.subscribed ? 'Não receber mais por e-mail' : 'Voltar a receber por e-mail'}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Só o e-mail muda. As notificações no app seguem o que você escolheu em Você › Notificações.
      </p>
    </div>
  );
}
