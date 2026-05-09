import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CopyMcpUrl } from '@/components/profile/copy-mcp-url';
import { getCurrentUser } from '@/lib/auth-server';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const mcpUrl = `${apiUrl}/mcp`;
  const logtoEndpoint = process.env.LOGTO_ENDPOINT ?? '';

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Nome:</span> {user?.name ?? '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user?.email ?? '—'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conectar ao Claude</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Configure o conector MCP no Claude com a URL abaixo. Faça login com a mesma conta que
            usa neste app.
          </p>
          <CopyMcpUrl url={mcpUrl} />
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Abra Claude → Configurações → Conectores → Adicionar</li>
            <li>Cole a URL acima</li>
            <li>Faça login com sua conta Fatia (Logto)</li>
          </ol>
        </CardContent>
      </Card>

      {logtoEndpoint && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessões e segurança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Gerencie sessões ativas, dispositivos e senha pelo console do Logto.
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href={logtoEndpoint} target="_blank" rel="noopener noreferrer">
                Abrir console do Logto
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sair</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="destructive" className="w-full">
            <Link href="/api/logto/sign-out">Sair</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
