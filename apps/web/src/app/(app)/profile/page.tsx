'use client';

import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-semibold">Perfil</h1>
      <button
        onClick={handleLogout}
        className="w-full rounded-md border border-destructive py-2 text-sm text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
      >
        Sair
      </button>
    </div>
  );
}
