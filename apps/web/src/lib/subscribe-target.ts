const INTERVALS = ['YEARLY', 'MONTHLY'];
const METHODS = ['PIX', 'BOLETO', 'CREDIT_CARD'];

type Param = string | string[] | undefined;
const one = (v: Param, allowed: string[]) =>
  typeof v === 'string' && allowed.includes(v) ? v : null;

/**
 * Para onde vai o "Assinar PRO" do site (Si-04, #386). O site é estático e não
 * tem sessão: o formulário dele manda o período e a forma de pagamento para
 * `/assinar`, e daqui a pessoa segue ao Meu plano — pelo login, quando não
 * entrou, sem perder a escolha. Só valores conhecidos passam: a URL vem de fora.
 */
export function subscribeTarget(
  search: { periodo?: Param; pagamento?: Param },
  loggedIn: boolean,
): string {
  const q = new URLSearchParams();
  const periodo = one(search.periodo, INTERVALS);
  const pagamento = one(search.pagamento, METHODS);
  if (periodo) q.set('periodo', periodo);
  if (pagamento) q.set('pagamento', pagamento);
  const qs = q.toString();
  const plan = `/plan${qs ? `?${qs}` : ''}`;
  return loggedIn ? plan : `/login?next=${encodeURIComponent(plan)}`;
}
