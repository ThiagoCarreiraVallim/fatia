import type { MyPlan, SubscriptionSource } from './billing';
import type { AiAccessReason } from './chat';

/**
 * Textos e regras da tela "Meu plano", iguais na web e no app (ADR 024).
 */

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/\u00a0/g, ' ');
}

/** "economize 25%" comparando o anual com doze meses do mensal. */
export function yearlySavingsLabel(prices: MyPlan['prices']): string | null {
  const cheio = prices.monthlyCents * 12;
  if (cheio <= prices.yearlyCents) return null;
  return `economize ${Math.round((1 - prices.yearlyCents / cheio) * 100)}%`;
}

/** O anual dividido em doze, para comparar com o mensal ("R$ 14,92/mês"). */
export function yearlyPerMonthLabel(prices: MyPlan['prices']): string {
  return `${formatBRL(Math.round(prices.yearlyCents / 12))}/mês`;
}

/** O que o PRO acrescenta. O Free continua com tudo o mais. */
export const PRO_BENEFITS = [
  { key: 'chat', title: 'Chat com a IA', text: 'Pergunte e registre conversando.' },
  {
    key: 'foto',
    title: 'Foto da refeição',
    text: 'Tire uma foto e confira o que a IA reconheceu.',
  },
  { key: 'ditado', title: 'Ditado', text: 'Fale em vez de digitar no chat.' },
] as const;

export type ProFeature = (typeof PRO_BENEFITS)[number]['key'];

export const FREE_INCLUDES = [
  'Registro de refeições, treinos, água, peso e passos',
  'Metas, progresso e conquistas',
  'Sua própria IA (Claude e outras) pelo MCP',
  'Exportar e apagar seus dados',
] as const;

const SOURCE_NAME: Record<SubscriptionSource, string> = {
  ASAAS: 'pela web',
  APPLE: 'pela App Store',
  GOOGLE: 'pelo Google Play',
  MANUAL: 'cortesia',
  INSTANCE: 'liberado nesta instância',
  GROUP: 'pela comunidade',
};

function dia(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  })
    .format(d)
    .replace('.', '');
}

/**
 * A linha de resumo do plano: "Free", "PRO mensal · renova em 15 nov",
 * "PRO até 15 nov · cancelado", "Pagamento em atraso · regularize até 22 nov"…
 */
export function planSummary(plan: MyPlan): string {
  if (plan.source === 'INSTANCE') return 'IA liberada nesta instância';
  if (plan.tier === 'FREE') {
    if (plan.reason === 'pendente') return 'Free · pagamento aguardando confirmação';
    if (plan.reason === 'inadimplente') return 'Free · o pagamento do PRO não foi confirmado';
    if (plan.degraded) return 'Free · seu PRO terminou';
    return 'Free';
  }
  if (plan.source === 'GROUP') {
    // A cobrança é da comunidade: a pessoa não renova, não cancela e não regulariza nada.
    const quem = plan.groupName ? `PRO pela comunidade ${plan.groupName}` : 'PRO pela comunidade';
    if (plan.reason === 'carencia') return `${quem} · pagamento da comunidade em atraso`;
    const fimDoAssento = dia(plan.currentPeriodEnd);
    if (plan.cancelAtPeriodEnd && fimDoAssento) return `${quem} até ${fimDoAssento}`;
    return quem;
  }
  const tipo =
    plan.interval === 'YEARLY' ? 'PRO anual' : plan.interval === 'MONTHLY' ? 'PRO mensal' : 'PRO';
  const fim = dia(plan.currentPeriodEnd);
  if (plan.reason === 'carencia') {
    const ate = dia(plan.graceEndsAt);
    return `Pagamento em atraso${ate ? ` · regularize até ${ate}` : ''}`;
  }
  if (plan.cancelAtPeriodEnd) return `${tipo} até ${fim ?? 'o fim do período'} · cancelado`;
  if (plan.source === 'MANUAL') return fim ? `PRO cortesia até ${fim}` : 'PRO cortesia';
  return fim ? `${tipo} · renova em ${fim}` : tipo;
}

export function sourceLabel(
  source: SubscriptionSource | null,
  groupName: string | null = null,
): string | null {
  if (source === 'GROUP' && groupName) return `${SOURCE_NAME.GROUP} ${groupName}`;
  return source ? SOURCE_NAME[source] : null;
}

/** Só dígitos, com a máscara 000.000.000-00 enquanto a pessoa digita. */
export function maskCpf(entrada: string): string {
  const d = entrada.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** Mesma regra da API (`billing/cpf.ts`): dígitos verificadores. */
export function isCpfValid(entrada: string): boolean {
  const cpf = entrada.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

/**
 * Como mostrar uma função de IA: `hidden` (a instância não tem), `locked`
 * (tem, e é do PRO — mostra com cadeado e leva ao plano) ou `open`.
 */
export function aiLock(
  access: { available: boolean; allowed?: boolean; reason?: AiAccessReason } | undefined,
): 'hidden' | 'locked' | 'open' {
  if (!access?.available) return 'hidden';
  if (access.allowed === false && access.reason === 'plan_required') return 'locked';
  return access.allowed === false ? 'hidden' : 'open';
}

/** A rota de "Meu plano", com o recurso que trouxe a pessoa até ali. */
export function planHref(feature?: ProFeature): string {
  return feature ? `/plan?recurso=${feature}` : '/plan';
}
