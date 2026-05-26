import Link from 'next/link';
import { Flag, Watch, Settings, LogOut, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-server';
import { CopyMcpUrl } from '@/components/profile/copy-mcp-url';
import { ProfileMetrics } from '@/components/profile/profile-metrics';

interface MenuItemProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

function MenuItem({ href, icon, title, subtitle }: MenuItemProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 border-b border-white/5 px-4 py-4 last:border-b-0"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-foreground leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight size={18} className="text-muted-foreground" />
    </Link>
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const mcpUrl = `${apiUrl}/mcp`;

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <div className="flex flex-col items-center pt-2">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-card">
          <span className="text-3xl font-extrabold text-primary">
            {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-extrabold text-foreground">
          {user?.name ? user.name : 'Atleta Fatia'}
        </h1>
        {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
      </div>

      <ProfileMetrics />

      <nav className="overflow-hidden rounded-2xl border border-white/5 bg-card">
        <MenuItem
          href="/goals"
          icon={<Flag size={18} className="text-primary" />}
          title="Metas"
          subtitle="Acompanhe seus objetivos pessoais"
        />
        <MenuItem
          href="/nutrition/goals"
          icon={<Settings size={18} className="text-primary" />}
          title="Metas de nutrição"
          subtitle="Calorias e macros diários"
        />
        <MenuItem
          href="/profile/tokens"
          icon={<Watch size={18} className="text-primary" />}
          title="Dispositivos"
          subtitle="Integração com Apple Health e Garmin"
        />
      </nav>

      {/* Plain <a> intencional: Next.js Link faz prefetch que executaria o
          handler /api/logto/sign-out e limparia a sessão antes do clique. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/logto/sign-out"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/50 bg-transparent px-4 py-4 text-base font-bold text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut size={18} />
        Sair da conta
      </a>

      <details className="rounded-2xl border border-white/5 bg-card/50 px-4 py-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-bold text-foreground">Conectar ao Claude</summary>
        <div className="mt-3 space-y-3 text-xs">
          <p>Configure o conector MCP no Claude com a URL abaixo.</p>
          <CopyMcpUrl url={mcpUrl} />
        </div>
      </details>
    </div>
  );
}
