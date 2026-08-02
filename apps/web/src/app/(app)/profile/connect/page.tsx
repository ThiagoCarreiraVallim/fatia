import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-server';
import { mcpServerUrl } from '@/lib/mcp-url';
import { ConnectSteps } from '@/components/profile/connect-steps';
import { ConnectTroubleshooting } from '@/components/profile/connect-troubleshooting';

/**
 * Fluxo guiado para conectar a IA do usuário ao Fatia (issue #164).
 *
 * Substitui `/profile/tokens`, que entregava um endereço de exemplo e um punhado de jargão. O
 * critério aqui é o da issue: alguém sem conhecimento técnico conecta sozinho e sabe que deu
 * certo.
 */
export default async function ConnectPage() {
  const user = await getCurrentUser();
  const serverUrl = mcpServerUrl();
  const accountEmail = user?.email ? user.email : undefined;

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <header className="flex items-center gap-2">
        <Link href="/profile" className="rounded p-1 hover:bg-accent" aria-label="Voltar">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-extrabold text-foreground">Conectar sua IA</h1>
      </header>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Dá para registrar o que você comeu e treinou conversando com o Claude, e perguntar sobre o
        seu histórico sem abrir o app. Leva um minuto, e não custa nada além do que você já paga
        pelo Claude.
      </p>

      <ConnectSteps serverUrl={serverUrl} accountEmail={accountEmail} />

      <ConnectTroubleshooting accountEmail={accountEmail} />
    </div>
  );
}
