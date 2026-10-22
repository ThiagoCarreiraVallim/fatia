import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * Painel do profissional (#157) — superfície B2B, separada do app do usuário.
 *
 * Route group próprio, e não uma aba dentro de `(app)`: o que se vê aqui é dado
 * de **outra pessoa**, e misturá-lo com as telas do próprio usuário é o começo
 * de "de quem é este número?". Sem `BottomNav`, pelo mesmo motivo.
 *
 * Não há guarda de papel neste layout, e é decisão: o papel de `PROFESSIONAL`
 * não é global, é por grupo, e a resposta certa para quem não atende ninguém é
 * uma lista vazia — não um 403 que revelaria a existência do painel. Quem barra
 * de verdade é a API, uma leitura por vez.
 *
 * A barra de topo é a mesma do app (voltar + título): "Membros" volta ao
 * Início, e o membro volta para "Membros".
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <TopBarProvider>
      <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)]">
        <AppTopBar />
        <main className="flex-1 pb-10">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </TopBarProvider>
  );
}
