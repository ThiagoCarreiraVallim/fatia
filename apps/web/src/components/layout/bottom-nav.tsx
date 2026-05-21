'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Apple, Dumbbell, TrendingUp, User, Home } from 'lucide-react';

const navItems = [
  { href: '/progress', label: 'Progresso', icon: TrendingUp },
  { href: '/nutrition', label: 'Nutrição', icon: Apple },
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/workout', label: 'Treino', icon: Dumbbell },
  { href: '/profile', label: 'Perfil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-20 backdrop-blur-xl bg-muted/80 border-t border-white/10 rounded-tl-xl rounded-tr-xl">
      <div className="flex h-full items-center justify-around px-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] transition-colors"
            >
              <Icon size={18} className={active ? 'text-primary' : 'text-muted-foreground'} />
              <span className={active ? 'text-primary font-bold' : 'text-muted-foreground'}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
