import type { Metadata } from 'next';
import { Apple, Dumbbell, LineChart, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { Page } from '@/components/chrome';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Conectar no Claude',
  description:
    'Conecte o Fatia ao Claude e registre refeições e treinos conversando. Sem configuração, sem custo de IA extra.',
  alternates: { canonical: '/claude-connect/' },
};

/**
 * Landing para quem chega pelo Claude (issue #96).
 *
 * O público é o usuário final que ouviu falar do Fatia num conector — não o dev
 * que chega pelo GitHub. Por isso a página abre com o que dá para PEDIR ao
 * Claude, não com a stack.
 */

const PROMPTS = [
  {
    icon: Apple,
    label: 'Nutrição',
    examples: [
      '"Comi 200 g de frango grelhado e uma xícara de arroz no almoço"',
      '"Quantas calorias eu comi hoje?"',
      '"Estou batendo minha meta de proteína essa semana?"',
    ],
  },
  {
    icon: Dumbbell,
    label: 'Treino',
    examples: [
      '"Começando o treino de push"',
      '"Supino 4 séries de 8 com 70 kg"',
      '"Qual foi minha última carga no agachamento?"',
    ],
  },
  {
    icon: LineChart,
    label: 'Progresso',
    examples: [
      '"Quanto eu progredi no supino nos últimos 3 meses?"',
      '"Pesei 78,4 kg hoje"',
      '"Como está minha média de passos esse mês?"',
    ],
  },
];

const STEPS = [
  {
    title: 'Crie sua conta no Fatia',
    body: (
      <>
        Leva menos de um minuto em{' '}
        <a href={site.appUrl} className="text-foreground underline underline-offset-4">
          {site.appUrl.replace('https://', '')}
        </a>
        . É a mesma conta que o Claude vai usar.
      </>
    ),
  },
  {
    title: 'No Claude, abra Settings → Connectors',
    body: <>Clique em &ldquo;Add custom connector&rdquo;.</>,
  },
  {
    title: 'Cole o endereço do servidor',
    body: (
      <>
        <code className="bg-muted mt-2 inline-block rounded px-2 py-1 font-mono text-sm">
          {site.mcpUrl}
        </code>
        <span className="mt-2 block">
          Só isso. Sem client ID, sem secret, sem token para copiar.
        </span>
      </>
    ),
  },
  {
    title: 'Autorize',
    body: (
      <>
        O Claude abre a tela de login do Fatia. Você entra, autoriza, e volta para a conversa já
        conectado.
      </>
    ),
  },
];

const TRUST = [
  {
    icon: Lock,
    title: 'Seus dados são seus',
    body: 'Exporte tudo em JSON ou apague a conta quando quiser — pedindo ao próprio Claude. Sem formulário, sem espera.',
  },
  {
    icon: ShieldCheck,
    title: 'Nada é vendido nem rastreado',
    body: 'Sem analytics, sem pixel, sem anúncio. O único cookie é o de sessão.',
  },
  {
    icon: Sparkles,
    title: 'Sem custo de IA',
    body: 'O Fatia não tem chave de API de LLM. O processamento roda na sua assinatura do Claude — não cobramos por isso e não repassamos seus dados a nenhum provedor de IA.',
  },
];

export default function ClaudeConnectPage() {
  return (
    <Page>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24">
        <p className="text-primary font-display text-sm font-bold tracking-widest uppercase">
          Conector para o Claude
        </p>
        <h1 className="font-display mt-4 max-w-3xl text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-6xl">
          Registre o que você come e treina <span className="text-primary">conversando</span>.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          O Fatia dá ao Claude acesso ao seu diário de nutrição e treino. Você fala, ele registra —
          e responde sobre o seu histórico. Com a tabela TACO, feita para comida brasileira.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={site.appUrl}
            className="rounded-xl bg-primary px-6 py-3.5 font-display font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Criar conta grátis
          </a>
          <a
            href="#como-conectar"
            className="border-border hover:bg-muted rounded-xl border px-6 py-3.5 font-semibold transition-colors"
          >
            Como conectar
          </a>
        </div>
      </section>

      {/* O que dá para pedir */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          O que você pode pedir
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PROMPTS.map(({ icon: Icon, label, examples }) => (
            <div key={label} className="border-border/60 bg-card/40 rounded-2xl border p-6">
              <div className="flex items-center gap-2.5">
                <Icon size={18} className="text-primary" aria-hidden />
                <h3 className="font-display font-bold">{label}</h3>
              </div>
              <ul className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed">
                {examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-6 text-sm">
          São 87 ações disponíveis ao Claude — tudo que o app faz, ele faz.
        </p>
      </section>

      {/* Como conectar */}
      <section id="como-conectar" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-12">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Como conectar
        </h2>
        <p className="text-muted-foreground mt-3">Quatro passos, nenhum terminal.</p>
        <ol className="mt-8 space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span
                className="bg-primary/10 text-primary font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="pt-1">
                <h3 className="font-semibold">{step.title}</h3>
                <div className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {step.body}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Confiança */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-5 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border-border/60 rounded-2xl border p-6">
              <Icon size={18} className="text-primary" aria-hidden />
              <h3 className="font-display mt-3 font-bold">{title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Auto-hospedagem */}
      <section className="mx-auto max-w-5xl px-6 py-12 pb-20">
        <div className="border-border/60 bg-card/40 rounded-2xl border p-8">
          <h2 className="font-display text-xl font-extrabold tracking-tight">
            Prefere rodar no seu servidor?
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
            O Fatia é software livre. A instância pública é uma conveniência, não uma amarra — o
            código, o schema e as instruções de deploy estão todos abertos, e auto-hospedar é um
            caminho de primeira classe.
          </p>
          <a
            href={site.repoUrl}
            className="border-border hover:bg-muted mt-6 inline-block rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
          >
            Ver no GitHub
          </a>
        </div>
      </section>
    </Page>
  );
}
