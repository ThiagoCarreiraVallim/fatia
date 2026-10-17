'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Lock } from 'lucide-react';
import {
  billingApi,
  formatBRL,
  FREE_INCLUDES,
  isCpfValid,
  maskCpf,
  planSummary,
  PRO_BENEFITS,
  sourceLabel,
  yearlyPerMonthLabel,
  yearlySavingsLabel,
  type BillingInterval,
  type MyPlan,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PlanBadge } from './plan-badge';

export const PLAN_QUERY_KEY = ['billing', 'plan'] as const;

/**
 * "Meu plano" (ADR 024): o que o Free tem, o que o PRO acrescenta, e a
 * assinatura pela web (Asaas: Pix, boleto ou cartão).
 *
 * O pagamento acontece na página do Asaas, numa aba nova; esta tela fica
 * consultando o plano até o webhook confirmar, para a pessoa voltar e já ver
 * o PRO.
 */
export function PlanScreen() {
  const params = useSearchParams();
  const recurso = params.get('recurso');
  const qc = useQueryClient();

  const plan = useQuery({
    queryKey: PLAN_QUERY_KEY,
    queryFn: () => billingApi.plan(),
    // Enquanto o pagamento não confirma, confere a cada 5 s.
    refetchInterval: (q) => (q.state.data?.reason === 'pendente' ? 5_000 : false),
  });

  const atualizar = (novo: MyPlan) => {
    qc.setQueryData(PLAN_QUERY_KEY, novo);
    // O cadeado do chat e da foto dependem do plano.
    void qc.invalidateQueries({ queryKey: ['chat', 'availability'] });
  };

  return (
    <div className="space-y-5 p-4">
      {plan.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : plan.isError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
          <p className="text-sm text-muted-foreground">Não foi possível carregar seu plano.</p>
          <Button variant="outline" size="sm" onClick={() => void plan.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          <ResumoDoPlano plan={plan.data} onChange={atualizar} />
          <Beneficios pro={plan.data.tier === 'PRO'} destaque={recurso} />
          {plan.data.tier === 'FREE' && plan.data.requiresPlan && (
            <Assinar plan={plan.data} onChange={atualizar} />
          )}
          <LivreSempre />
        </>
      )}
    </div>
  );
}

function ResumoDoPlano({ plan, onChange }: { plan: MyPlan; onChange: (p: MyPlan) => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const cancelar = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: (novo) => {
      setConfirmar(false);
      onChange(novo);
    },
  });
  const pro = plan.tier === 'PRO';
  const origem = sourceLabel(plan.source, plan.groupName);
  const daComunidade = plan.source === 'GROUP';
  const podeCancelar =
    pro && plan.source === 'ASAAS' && !plan.cancelAtPeriodEnd && plan.reason !== 'carencia';

  return (
    <section aria-labelledby="plano-atual" className="rounded-2xl border border-subtle bg-card p-4">
      <div className="flex items-center gap-2">
        <PlanBadge tier={plan.tier} />
        <h2 id="plano-atual" className="flex-1 text-lg font-bold">
          {planSummary(plan)}
        </h2>
      </div>
      {pro && origem && plan.source !== 'INSTANCE' && !daComunidade && (
        <p className="mt-1 text-sm text-muted-foreground">Assinatura {origem}.</p>
      )}
      {daComunidade && (
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.groupName
            ? `A comunidade ${plan.groupName} paga seu PRO.`
            : 'A comunidade paga seu PRO.'}{' '}
          Se ela retirar o assento, você volta ao Free sem perder nenhum registro.
        </p>
      )}
      {!plan.requiresPlan && (
        <p className="mt-1 text-sm text-muted-foreground">
          Nesta instância a IA do Fatia é liberada para todos.
        </p>
      )}
      {plan.reason === 'pendente' && plan.paymentUrl && (
        <div className="mt-3 space-y-2" role="status">
          <p className="text-sm text-muted-foreground">
            Aguardando a confirmação do pagamento. Pix costuma levar segundos; boleto, até 3 dias
            úteis. Esta tela atualiza sozinha.
          </p>
          <Button asChild variant="outline" size="sm">
            <a href={plan.paymentUrl} target="_blank" rel="noopener noreferrer">
              Abrir página de pagamento
              <ExternalLink size={14} aria-hidden />
            </a>
          </Button>
        </div>
      )}
      {plan.reason === 'carencia' && daComunidade && (
        <p className="mt-2 text-sm text-warning">
          A comunidade está com o pagamento em atraso. A IA continua liberada por alguns dias.
        </p>
      )}
      {plan.reason === 'carencia' && !daComunidade && (
        <p className="mt-2 text-sm text-warning">
          A IA continua liberada até a data acima. Pague a cobrança em aberto pelo link que o Asaas
          enviou ao seu e-mail.
        </p>
      )}
      {plan.manageUrl && (
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href={plan.manageUrl} target="_blank" rel="noopener noreferrer">
            Gerenciar na loja
            <ExternalLink size={14} aria-hidden />
          </a>
        </Button>
      )}
      {podeCancelar && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-danger"
            onClick={() => setConfirmar(true)}
          >
            Cancelar assinatura
          </Button>
          <ConfirmDialog
            open={confirmar}
            onOpenChange={setConfirmar}
            title="Cancelar o PRO?"
            description="A renovação para. Você continua PRO até o fim do período já pago, e depois volta ao Free sem perder nenhum registro."
            confirmLabel="Cancelar assinatura"
            pendingLabel="Cancelando..."
            pending={cancelar.isPending}
            onConfirm={() => cancelar.mutate()}
          />
          {cancelar.error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {cancelar.error.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Beneficios({ pro, destaque }: { pro: boolean; destaque: string | null }) {
  return (
    <section aria-labelledby="o-que-o-pro-tem" className="space-y-2">
      <h2
        id="o-que-o-pro-tem"
        className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {pro ? 'Seu PRO inclui' : 'O PRO acrescenta'}
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
            {pro ? (
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

function LivreSempre() {
  return (
    <section aria-labelledby="livre-sempre" className="space-y-2">
      <h2
        id="livre-sempre"
        className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        Livre em qualquer plano
      </h2>
      <ul className="space-y-2 rounded-2xl border border-subtle bg-card p-4">
        {FREE_INCLUDES.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Assinar({ plan, onChange }: { plan: MyPlan; onChange: (p: MyPlan) => void }) {
  const [interval, setInterval] = useState<BillingInterval>(plan.interval ?? 'YEARLY');
  const [cpf, setCpf] = useState('');
  const [tocado, setTocado] = useState(false);
  const cpfOk = isCpfValid(cpf);
  const economia = yearlySavingsLabel(plan.prices);
  // A aba é aberta no clique, ainda vazia, e recebe o link quando ele chega: aberta
  // depois da resposta, o bloqueador de pop-up do navegador a barraria.
  const aba = useRef<Window | null>(null);

  const checkout = useMutation({
    mutationFn: () => billingApi.checkout({ interval, cpf }),
    onSuccess: (novo) => {
      onChange(novo);
      if (novo.paymentUrl && aba.current) aba.current.location.href = novo.paymentUrl;
      else aba.current?.close();
    },
    onError: () => aba.current?.close(),
  });

  if (!plan.webCheckout) {
    return (
      <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
        A assinatura pela web não está disponível nesta instância.
      </p>
    );
  }

  const opcoes: { valor: BillingInterval; titulo: string; preco: string; nota: string | null }[] = [
    {
      valor: 'YEARLY',
      titulo: 'Anual',
      preco: `${formatBRL(plan.prices.yearlyCents)}/ano`,
      nota: [yearlyPerMonthLabel(plan.prices), economia].filter(Boolean).join(' · '),
    },
    {
      valor: 'MONTHLY',
      titulo: 'Mensal',
      preco: `${formatBRL(plan.prices.monthlyCents)}/mês`,
      nota: null,
    },
  ];

  return (
    <section aria-labelledby="assinar-pro" className="space-y-3">
      <h2
        id="assinar-pro"
        className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        Assinar o PRO
      </h2>
      <form
        className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTocado(true);
          if (!cpfOk) return;
          aba.current = window.open('', '_blank');
          // Sem `noopener` no open (ele devolveria null); corta o vínculo à mão.
          if (aba.current) aba.current.opener = null;
          checkout.mutate();
        }}
      >
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Período</legend>
          {opcoes.map((o) => (
            <label
              key={o.valor}
              className={cn(
                'flex cursor-pointer flex-col rounded-xl border p-3 transition-colors',
                interval === o.valor ? 'border-primary bg-primary/10' : 'border-subtle',
              )}
            >
              <input
                type="radio"
                name="periodo"
                value={o.valor}
                checked={interval === o.valor}
                onChange={() => setInterval(o.valor)}
                className="sr-only"
              />
              <span className="text-sm font-bold">{o.titulo}</span>
              <span className="text-base font-extrabold">{o.preco}</span>
              {o.nota && <span className="text-xs text-primary">{o.nota}</span>}
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
              'Exigido para emitir a cobrança. Vai direto ao Asaas e não fica guardado no Fatia.'
            )}
          </p>
        </div>

        {checkout.error && (
          <p role="alert" className="text-sm text-danger">
            {checkout.error.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={checkout.isPending}>
          {checkout.isPending ? 'Abrindo pagamento…' : 'Assinar PRO'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Pix, boleto ou cartão, na página segura do Asaas. Renova sozinho; cancele quando quiser e
          o PRO vale até o fim do período pago. Veja os{' '}
          <Link href="/terms" className="underline">
            Termos
          </Link>
          .
        </p>
      </form>
    </section>
  );
}
