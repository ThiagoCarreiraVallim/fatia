import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Page } from '@/components/chrome';
import { site } from '@/lib/site';

/**
 * Home institucional — PLACEHOLDER INTENCIONAL.
 *
 * O conteúdo definitivo vem do Thiago. Esta versão existe só para o domínio raiz
 * não responder 404 e para dar um caminho claro até `/claude-connect`, que é a
 * página que realmente converte hoje (issue #96).
 *
 * Ao substituir: mantenha o link para /claude-connect em destaque — é para lá
 * que vai quem chega pelo diretório de conectores do Claude.
 */
export default function HomePage() {
  return (
    <Page>
      <section className="mx-auto flex max-w-5xl flex-col items-start px-6 py-24 sm:py-32">
        <h1 className="font-display max-w-3xl text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-6xl">
          Nutrição e treino, <span className="text-primary">sem planilha</span>.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          O Fatia registra o que você come e treina, com a tabela TACO brasileira. Use pelo app ou
          conversando com o Claude.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={site.appUrl}
            className="font-display rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Criar conta grátis
          </a>
          <Link
            href="/claude-connect/"
            className="border-border hover:bg-muted group inline-flex items-center gap-2 rounded-xl border px-6 py-3.5 font-semibold transition-colors"
          >
            Usar com o Claude
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </section>
    </Page>
  );
}
