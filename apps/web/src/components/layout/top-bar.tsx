'use client';

import { Bell } from 'lucide-react';

export function TopBar() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between px-5 backdrop-blur-xl bg-background/70 border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-accent bg-card">
          <span className="text-sm font-bold text-primary">F</span>
        </div>
        <span className="font-jakarta text-2xl font-extrabold text-primary leading-none">
          Fatia
        </span>
      </div>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell size={20} />
      </button>
    </header>
  );
}
