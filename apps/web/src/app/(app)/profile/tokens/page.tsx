import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function TokensPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Link href="/profile" className="rounded p-1 hover:bg-accent" aria-label="Voltar">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Conectar com Claude</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        O fatia usa OAuth para autenticar o Claude via Logto. Siga os passos abaixo para configurar.
      </p>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-base">Como usar com o Claude</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <span>
              Abra o <strong>Claude.ai</strong> → Configurações → Integrações → Adicionar servidor
              MCP.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              2
            </span>
            <div className="space-y-1">
              <p>URL do servidor:</p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                https://seu-dominio.com/mcp/sse
              </code>
              <p className="text-xs text-muted-foreground">
                (use <code className="rounded bg-muted px-1">http://localhost:3000/mcp/sse</code>{' '}
                para desenvolvimento local)
              </p>
            </div>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              3
            </span>
            <span>
              Clique em <strong>Conectar</strong> — o Claude abrirá uma janela de login Logto.
              Autorize o acesso com sua conta.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              4
            </span>
            <span>Salve e inicie uma conversa com Claude! 🎉</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
