'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
