import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { safeNextPath, signInHref } from '@/lib/next-path';

type Props = { searchParams: Promise<{ next?: string }> };

// prefetch={false} em todos os links: /api/logto/sign-in inicia o fluxo OAuth
// por redirect, e um prefetch dispararia o fluxo antes do clique. `?next=` (o link
// de convite, por exemplo) segue junto para a pessoa voltar a ele depois.
export default async function LoginPage({ searchParams }: Props) {
  const next = safeNextPath((await searchParams).next);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-jakarta text-4xl font-bold text-primary">Fatia</h1>
          <p className="text-sm text-muted-foreground">
            Seu diário de nutrição e treino — rápido de registrar, fácil de acompanhar.
          </p>
        </div>

        <div className="space-y-3">
          <Button asChild size="lg" className="w-full h-12 text-base">
            <Link href={signInHref(next)} prefetch={false}>
              Entrar
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full h-12 text-base">
            <Link href={signInHref(next, 'cadastro')} prefetch={false}>
              Criar conta grátis
            </Link>
          </Button>
          <div className="text-center">
            <Button asChild variant="link" className="text-muted-foreground">
              <Link href={signInHref(next, 'senha')} prefetch={false}>
                Esqueci minha senha
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          A mesma conta funciona no seu assistente de IA pelo conector MCP.
        </p>
      </div>
    </div>
  );
}
