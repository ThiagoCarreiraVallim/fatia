import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-server';
import { subscribeTarget } from '@/lib/subscribe-target';

type Props = {
  searchParams: Promise<{ periodo?: string | string[]; pagamento?: string | string[] }>;
};

/**
 * `/assinar` (#386, Si-04): a ponte do "Assinar PRO" do site ao Meu plano.
 * Pública, sem o gate de `(app)` — que mandaria ao login sem a escolha —, e
 * sem tela própria: só redireciona.
 */
export default async function SubscribePage({ searchParams }: Props) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  redirect(subscribeTarget(params, Boolean(user)));
}
