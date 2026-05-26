import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Fatia</CardTitle>
          <CardDescription>Entre com sua conta Logto</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Plain <a> intencional: o handler /api/logto/sign-in dispara o
              fluxo OAuth via redirect, hard navigation é o correto. Link do
              Next prefetcharia (mesmo origin) e disparava o flow antes do clique. */}
          <Button asChild className="w-full">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/logto/sign-in">Entrar</a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            A mesma conta funciona no Claude pelo conector MCP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
