'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Camera,
  Check,
  ExternalLink,
  Lock,
  MessageCircle,
  Mic,
  Users,
} from 'lucide-react';
import {
  billingApi,
  isCpfValid,
  maskCpf,
  planOfferView,
  planStatusView,
  PRO_BENEFITS,
  webTermsText,
  type BillingInterval,
  type MyPlan,
  type PaymentMethod,
  type PlanStatusView,
  type PlanTone,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const PLAN_QUERY_KEY = ['billing', 'plan'] as const;

const BADGE: Record<PlanTone, 'pro' | 'trial' | 'lite' | 'pending' | 'free'> = {
  pro: 'pro',
  trial: 'trial',
  warn: 'lite',
  mute: 'pending',
  free: 'free',
};

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'CREDIT_CARD', label: 'Cartão' },
];

/** `?periodo=` e `?pagamento=` que o site (Si-04) manda junto. */
function intervalParam(v: string | null): BillingInterval | null {
  if (v === 'YEARLY' || v === 'anual') return 'YEARLY';
  if (v === 'MONTHLY' || v === 'mensal') return 'MONTHLY';
  return null;
}
function methodParam(v: string | null): PaymentMethod | null {
  return METHODS.find((m) => m.value === v?.toUpperCase())?.value ?? null;
}

/**
 * "Meu plano" na web (#386; pranchas Al-M13, Al-M13b/c, Al-M5 e Si-04).
 *
 * A web pode vender pelo Asaas (Pix, boleto ou cartão): o cartão do estado
 * sai de `planStatusView` com `surface: 'web'`, que traz "Abrir página de
 * pagamento", o prazo do Pix e do boleto e o cancelar. O pagamento acontece
 * na página do Asaas, numa aba nova; esta tela consulta o plano até o webhook
 * confirmar. O CPF vai direto ao Asaas e não fica no Fatia; o cartão também.
 */
export function PlanScreen() {
  const params = useSearchParams();
  const recurso = params.get('recurso');
  const qc = useQueryClient();

  const plan = useQuery({
    queryKey: PLAN_QUERY_KEY,
    queryFn: () => billingApi.plan(),
    // Enquanto o pagamento não confirma, confere a cada 5 s.
    refetchInterval: (q) => (q.state.data?.state === 'PENDING' ? 5_000 : false),
  });

  const atualizar = (novo: MyPlan) => {
    qc.setQueryData(PLAN_QUERY_KEY, novo);
    // O cadeado do chat e da foto dependem do plano.
    void qc.invalidateQueries({ queryKey: ['chat', 'availability'] });
  };

  if (plan.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (plan.isError) {
    return (
      <div role="alert" className="m-4 space-y-3 rounded-2xl border border-subtle bg-card p-4">
        <p className="text-sm text-muted-foreground">Não foi possível carregar seu plano.</p>
        <Button variant="outline" size="sm" onClick={() => void plan.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const p = plan.data;
  const view = planStatusView(p, {
    surface: 'web',
    canPurchase: p.webCheckout,
    now: new Date(),
  });

  return (
    <div className="space-y-5 p-4">
      {p.state === 'FREE' && view.offer === 'web' ? null : (
        <StatusCard plan={p} view={view} onChange={atualizar} />
      )}
      <Beneficios view={view} destaque={recurso} />
      {view.offer === 'web' || (p.state === 'PENDING' && p.webCheckout) ? (
        <Assinar
          plan={p}
          onChange={atualizar}
          collapsed={p.state === 'PENDING'}
          initialInterval={intervalParam(params.get('periodo'))}
          initialMethod={methodParam(params.get('pagamento'))}
        />
      ) : null}
      {view.offer === null && p.state === 'FREE' && !p.webCheckout ? (
        <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
          A assinatura pela web não está disponível nesta instância.
        </p>
      ) : null}
      <p className="px-1 text-center text-xs text-muted-foreground">
        Livre em qualquer plano: registro manual, metas e conquistas, sua própria IA pelo MCP,
        exportar e apagar seus dados.
      </p>
    </div>
  );
}

function StatusCard({
  plan,
  view,
  onChange,
}: {
  plan: MyPlan;
  view: PlanStatusView;
  onChange: (p: MyPlan) => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const cancelar = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: (novo) => {
      setConfirmar(false);
      onChange(novo);
    },
  });
  const trial = plan.state === 'TRIAL';

  return (
    <div className="space-y-4">
      {view.community && (
        <section className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-field bg-brand text-brand-foreground">
              <Users size={20} aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold">{view.community.title}</h2>
              <p className="text-xs text-muted-foreground">{view.community.until}</p>
            </div>
          </div>
          {view.community.program && (
            <div className="flex items-center gap-3 rounded-field bg-muted px-4 py-3">
              <CalendarDays size={18} aria-hidden />
              <div>
                <p className="text-sm font-semibold">PRO até {view.community.program.until}</p>
                <p className="text-xs text-muted-foreground">
                  {view.community.program.name} · faltam {view.community.program.daysLeft}{' '}
                  {view.community.program.daysLeft === 1 ? 'dia' : 'dias'}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <section
        aria-labelledby="plano-atual"
        className={cn(
          'space-y-3 rounded-2xl border border-subtle bg-card p-4',
          view.tone === 'warn' && 'border-[hsl(var(--warning)/0.6)]',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={BADGE[view.tone]}>{view.badge}</Badge>
          {view.via && <span className="text-xs text-muted-foreground">{view.via}</span>}
        </div>
        <h2 id="plano-atual" className="text-lg font-bold">
          {view.community ? 'PRO pela comunidade' : view.title}
        </h2>
        <p
          className="text-sm text-muted-foreground"
          role={view.tone === 'warn' ? 'status' : undefined}
        >
          {view.body}
        </p>
        <div className="flex flex-wrap gap-2">
          {view.actions.map((a, i) => {
            if (a.kind === 'pay' || a.kind === 'store') {
              return (
                <Button key={a.kind} asChild variant={i === 0 ? 'default' : 'outline'} size="sm">
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.label}
                    <ExternalLink size={14} aria-hidden />
                  </a>
                </Button>
              );
            }
            if (a.kind === 'cancel') {
              return (
                <Button
                  key={a.kind}
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => setConfirmar(true)}
                >
                  {a.label}
                </Button>
              );
            }
            if (a.kind === 'open-ai') {
              return (
                <Button key={a.kind} asChild size="sm">
                  <Link href="/chat">{a.label}</Link>
                </Button>
              );
            }
            if (a.kind === 'subscribe') {
              return (
                <Button key={a.kind} asChild size="sm">
                  <a href="#assinar">{a.label}</a>
                </Button>
              );
            }
            return null;
          })}
        </div>
        {view.note && <p className="text-xs text-muted-foreground">{view.note}</p>}
        {view.why && (
          <div className="rounded-field bg-muted p-3">
            <p className="text-sm font-semibold">{view.why.title}</p>
            <p className="text-xs text-muted-foreground">{view.why.body}</p>
          </div>
        )}
        <ConfirmDialog
          open={confirmar}
          onOpenChange={setConfirmar}
          title={trial ? 'Cancelar o teste?' : 'Cancelar o PRO?'}
          description={
            trial
              ? 'Nada é cobrado. O PRO segue até o fim do teste e depois você volta ao Free sem perder nenhum registro.'
              : 'A renovação para. Você continua PRO até o fim do período já pago, e depois volta ao Free sem perder nenhum registro.'
          }
          confirmLabel={trial ? 'Cancelar o teste' : 'Cancelar assinatura'}
          pendingLabel="Cancelando..."
          pending={cancelar.isPending}
          onConfirm={() => cancelar.mutate()}
        />
        {cancelar.error && (
          <p role="alert" className="text-sm text-danger">
            {cancelar.error.message}
          </p>
        )}
      </section>
    </div>
  );
}

function Beneficios({ view, destaque }: { view: PlanStatusView; destaque: string | null }) {
  const on = view.featuresOn;
  return (
    <section aria-labelledby="o-que-o-pro-tem" className="space-y-2">
      <h2
        id="o-que-o-pro-tem"
        className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {view.featuresTitle}
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-subtle bg-card">
        {PRO_BENEFITS.map((b) => (
          <li
            key={b.key}
            className={cn(
              'flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0',
              destaque === b.key && 'bg-primary/10',
            )}
          >
            {on ? (
              <Check size={18} className="text-primary" aria-hidden />
            ) : (
              <Lock size={18} className="text-muted-foreground" aria-hidden />
            )}
            <span className="flex-1">
              <span className="block font-semibold">{b.title}</span>
              <span className="block text-xs text-muted-foreground">{b.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TILES = [
  { icon: MessageCircle, label: 'Chat que registra e consulta tudo' },
  { icon: Camera, label: 'Foto do prato com revisão' },
  { icon: Mic, label: 'Ditado' },
];

/** Si-04 / Al-M2 na web: período, CPF, forma de pagamento e o teste. */
function Assinar({
  plan,
  onChange,
  collapsed,
  initialInterval,
  initialMethod,
}: {
  plan: MyPlan;
  onChange: (p: MyPlan) => void;
  /** Pendente: o formulário fica atrás de "Trocar a forma de pagamento". */
  collapsed: boolean;
  initialInterval: BillingInterval | null;
  initialMethod: PaymentMethod | null;
}) {
  const offer = planOfferView(plan);
  const [aberto, setAberto] = useState(!collapsed);
  const [interval, setInterval] = useState<BillingInterval>(
    initialInterval ?? plan.interval ?? 'YEARLY',
  );
  const [method, setMethod] = useState<PaymentMethod>(initialMethod ?? plan.paymentMethod ?? 'PIX');
  const [cpf, setCpf] = useState('');
  const [tocado, setTocado] = useState(false);
  const cpfOk = isCpfValid(cpf);
  // A aba é aberta no clique, ainda vazia, e recebe o link quando ele chega: aberta
  // depois da resposta, o bloqueador de pop-up do navegador a barraria.
  const aba = useRef<Window | null>(null);

  const checkout = useMutation({
    mutationFn: () => billingApi.checkout({ interval, cpf, paymentMethod: method }),
    onSuccess: (novo) => {
      onChange(novo);
      setAberto(false);
      // Teste começou sem cobrança agora: não há página para abrir.
      if (novo.state === 'PENDING' && novo.paymentUrl && aba.current) {
        aba.current.location.href = novo.paymentUrl;
      } else aba.current?.close();
    },
    onError: () => aba.current?.close(),
  });

  if (!aberto) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setAberto(true)}>
        Trocar a forma de pagamento
      </Button>
    );
  }

  return (
    <section aria-labelledby="assinar-pro" id="assinar" className="space-y-4">
      <div className="space-y-3">
        <h2 id="assinar-pro" className="text-2xl font-extrabold">
          Deixe a IA registrar por você
        </h2>
        <ul className="grid grid-cols-3 gap-2">
          {TILES.map((t) => (
            <li
              key={t.label}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card px-2 py-3 text-center text-xs"
            >
              <t.icon size={20} className="text-primary" aria-hidden />
              {t.label}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTocado(true);
          if (!cpfOk) return;
          // Com teste não há cobrança agora: nada de aba nova.
          if (offer.trialDays === 0) {
            aba.current = window.open('', '_blank');
            // Sem `noopener` no open (ele devolveria null); corta o vínculo à mão.
            if (aba.current) aba.current.opener = null;
          }
          checkout.mutate();
        }}
      >
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Período</legend>
          {offer.options.map((o) => (
            <label
              key={o.interval}
              className={cn(
                'flex cursor-pointer flex-col rounded-xl border p-3 transition-colors',
                interval === o.interval ? 'border-primary bg-primary/10' : 'border-subtle',
              )}
            >
              <input
                type="radio"
                name="periodo"
                value={o.interval}
                checked={interval === o.interval}
                onChange={() => setInterval(o.interval)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-sm font-bold">
                {o.title}
                {o.tag && <span className="text-xs text-primary">{o.tag}</span>}
              </span>
              <span className="text-base font-extrabold">
                {o.price}
                {o.interval === 'YEARLY' ? '/ano' : '/mês'}
              </span>
              <span className="text-xs text-muted-foreground">{o.per}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            onBlur={() => setTocado(true)}
            aria-invalid={tocado && !cpfOk}
            aria-describedby="cpf-ajuda"
          />
          <p id="cpf-ajuda" className="text-xs text-muted-foreground">
            {tocado && !cpfOk ? (
              <span className="text-danger">CPF inválido. Confira os números.</span>
            ) : (
              'Vai direto para o Asaas, não fica no Fatia.'
            )}
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Pagamento</legend>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <label
                key={m.value}
                className={cn(
                  'flex h-10 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold',
                  method === m.value ? 'border-primary bg-primary/10' : 'border-subtle',
                )}
              >
                <input
                  type="radio"
                  name="pagamento"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        {checkout.error && (
          <p role="alert" className="text-sm text-danger">
            {checkout.error.message}
          </p>
        )}

        <Button type="submit" size="xl" className="w-full" disabled={checkout.isPending}>
          {checkout.isPending ? 'Abrindo pagamento…' : offer.cta}
        </Button>
        <p className="text-xs text-muted-foreground">
          {webTermsText(offer.trialDays)} Veja os{' '}
          <Link href="/terms" className="underline">
            Termos de uso
          </Link>{' '}
          e a{' '}
          <Link href="/privacy" className="underline">
            Privacidade
          </Link>
          .
        </p>
      </form>
    </section>
  );
}
