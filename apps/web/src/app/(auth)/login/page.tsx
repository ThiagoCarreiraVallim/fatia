import Link from 'next/link';
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
          {/* prefetch={false} obrigatório: handler /api/logto/sign-in inicia
              o flow OAuth via redirect, prefetch poderia disparar antes do clique. */}
          <Button asChild className="w-full">
            <Link href="/api/logto/sign-in" prefetch={false}>
              Entrar
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            A mesma conta funciona no Claude pelo conector MCP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
