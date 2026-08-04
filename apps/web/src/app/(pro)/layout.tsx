import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
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
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-white/5 bg-background/70 px-5 backdrop-blur-xl">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Voltar ao meu app"
        >
          <ChevronLeft size={20} />
        </Link>
        <div>
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground">PAINEL</p>
          <p className="text-sm font-extrabold leading-none text-foreground">Meus alunos</p>
        </div>
      </header>
      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
