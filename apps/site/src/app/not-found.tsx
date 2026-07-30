import Link from 'next/link';
import { Page } from '@/components/chrome';

export default function NotFound() {
  return (
    <Page>
      <section className="mx-auto max-w-5xl px-6 py-32">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Página não encontrada
        </h1>
        <p className="text-muted-foreground mt-4">O endereço não existe ou foi movido.</p>
        <Link
          href="/"
          className="text-primary mt-8 inline-block font-semibold underline underline-offset-4"
        >
          Voltar para a home
        </Link>
      </section>
    </Page>
  );
}
