import Link from 'next/link';
import { Bell, Flag, Sparkles, Settings, Shield, ChevronRight, Users } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-server';
import { ProfileMetrics } from '@/components/profile/profile-metrics';
import { ProfessionalPanelLink } from '@/components/sharing/professional-panel-link';
import { AccountSection } from '@/components/profile/account-section';
import { PlanSection } from '@/components/billing/plan-section';
import { SignOutButton } from '@/components/profile/sign-out-button';

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
      className="flex items-center gap-4 border-b border-subtle px-4 py-4 last:border-b-0"
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

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <div className="flex flex-col items-center pt-2">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-card">
          <span className="text-3xl font-extrabold text-primary">
            {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
          </span>
        </div>

        {/* O `h1` da tela é o "Perfil" da barra de topo. */}
        <h2 className="mt-3 text-2xl font-extrabold text-foreground">
          {user?.name ? user.name : 'Atleta Fatia'}
        </h2>
        {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
      </div>

      <ProfileMetrics />

      <nav className="overflow-hidden rounded-2xl border border-subtle bg-card">
        {/* Só rende algo para quem atende alguém — ver o componente. */}
        <ProfessionalPanelLink />
        <MenuItem
          href="/community"
          icon={<Users size={18} className="text-primary" />}
          title="Comunidades"
          subtitle="Suas comunidades e o que você compartilha"
        />
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
        {/* O destino sempre foi a tela de conectar o Claude; o rótulo dizia "Dispositivos —
            Apple Health e Garmin", integrações que não existem (#151). Ninguém procuraria
            conexão de IA atrás de um ícone de relógio. */}
        <MenuItem
          href="/profile/connect"
          icon={<Sparkles size={18} className="text-primary" />}
          title="Conectar sua IA"
          subtitle="Registre e consulte seu diário conversando com o Claude"
        />
        <MenuItem
          href="/profile/notifications"
          icon={<Bell size={18} className="text-primary" />}
          title="Notificações"
          subtitle="O que chega no celular e onde"
        />
        <MenuItem
          href="/privacy"
          icon={<Shield size={18} className="text-primary" />}
          title="Privacidade e dados"
          subtitle="O que guardamos, e como exportar ou apagar"
        />
      </nav>

      <PlanSection />

      <AccountSection />

      <SignOutButton />
    </div>
  );
}
