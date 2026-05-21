import Link from 'next/link';
import {
  Flag,
  Watch,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Weight,
  Ruler,
  Pencil,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-server';
import { CopyMcpUrl } from '@/components/profile/copy-mcp-url';

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
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-card">
            <span className="text-3xl font-extrabold text-primary">
              {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            aria-label="Editar avatar"
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
          >
            <Pencil size={12} />
          </button>
        </div>

        <h1 className="mt-3 text-2xl font-extrabold text-foreground">
          {user?.name ? user.name : 'Atleta Fatia'}
        </h1>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-primary">
          <Flag size={12} />
          Plano Performance
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/5 bg-card p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Weight size={12} />
            Peso Atual
          </div>
          <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">78.5 kg</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-card p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Ruler size={12} />
            Estatura
          </div>
          <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">182 cm</p>
        </div>
      </div>

      <nav className="overflow-hidden rounded-2xl border border-white/5 bg-card">
        <MenuItem
          href="/goals"
          icon={<Flag size={18} className="text-primary" />}
          title="Metas"
          subtitle="Ajuste seus objetivos de treino"
        />
        <MenuItem
          href="/profile/tokens"
          icon={<Watch size={18} className="text-primary" />}
          title="Dispositivos"
          subtitle="Integração com Apple Health e Garmin"
        />
        <MenuItem
          href="/nutrition/goals"
          icon={<Settings size={18} className="text-primary" />}
          title="Configurações"
          subtitle="Privacidade e notificações"
        />
        <MenuItem
          href="#"
          icon={<HelpCircle size={18} className="text-primary" />}
          title="Suporte"
          subtitle="Fale com um treinador"
        />
      </nav>

      <Link
        href="/api/logto/sign-out"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/50 bg-transparent px-4 py-4 text-base font-bold text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut size={18} />
        Sair da conta
      </Link>

      <p className="text-center text-xs font-bold text-muted-foreground/60">v1.0.4</p>

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
