import type { ProBlockState } from './billing';

/**
 * Os textos do bloco PRO (prancha PRO · 9 estados), um por estado. Ficam aqui
 * para o PWA e o app dizerem a mesma coisa. `action` é `null` quando não há o
 * que fazer (PRO ativo pela comunidade); `canPurchase` falso troca qualquer
 * oferta de compra por "Tenho um código" (regra da loja no iOS).
 */
export interface ProBlockCopy {
  title: string;
  body: string;
  action: string | null;
  /** O tom do selo e da faixa: atenção para quem está perdendo acesso. */
  tone: 'neutral' | 'positive' | 'attention';
}

function dateBr(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const days = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export function proBlockCopy(state: ProBlockState, canPurchase = true): ProBlockCopy {
  const buy = canPurchase ? 'Assinar o PRO' : 'Tenho um código';
  switch (state.kind) {
    case 'free':
      return {
        title: 'IA no registro, no chat e na foto',
        body: `Teste o PRO por ${days(state.trialDays)}, sem cobrança no fim.`,
        action: canPurchase ? 'Começar o teste' : 'Tenho um código',
        tone: 'neutral',
      };
    case 'trial':
      return {
        title: `Teste · dia ${state.day} de ${state.totalDays}`,
        body: `Faltam ${days(state.daysLeft)} de PRO.`,
        action: buy,
        tone: 'positive',
      };
    case 'pro':
      return {
        title: 'Você é PRO',
        body: state.renewsAt
          ? `${state.interval === 'YEARLY' ? 'Plano anual' : 'Plano mensal'}, renova em ${dateBr(state.renewsAt)}.`
          : 'Tudo liberado.',
        action: 'Gerenciar',
        tone: 'positive',
      };
    case 'pro-community':
      return {
        title: state.groupName ? `PRO · ${state.groupName}` : 'PRO pela comunidade',
        body: 'Liberado pela sua comunidade enquanto você fizer parte dela.',
        action: null,
        tone: 'positive',
      };
    case 'pro-until':
      return {
        title: `PRO até ${dateBr(state.until)}`,
        body: `Faltam ${days(state.daysLeft)}. Depois volta para o Free, sem perder nada registrado.`,
        action: buy,
        tone: 'attention',
      };
    case 'lite-ending':
      return {
        title: `IA Lite: ${state.remaining} de ${state.limit} hoje`,
        body: 'A cota volta amanhã. No PRO não tem cota diária.',
        action: buy,
        tone: 'attention',
      };
    case 'free-no-purchase':
      return {
        title: 'O PRO chega pela comunidade',
        body: 'Peça o código à sua academia ou ao seu profissional.',
        action: 'Tenho um código',
        tone: 'neutral',
      };
    case 'pending-grace':
      return {
        title: 'Pagamento pendente',
        body: state.aiUntil
          ? `A IA segue ligada até ${dateBr(state.aiUntil)}. Faltam ${days(state.graceDaysLeft)}.`
          : `Faltam ${days(state.graceDaysLeft)} para regularizar.`,
        action: canPurchase ? 'Pagar agora' : 'Tenho um código',
        tone: 'attention',
      };
    case 'pro-expired':
      return {
        title: 'O PRO acabou',
        body: 'Seus registros continuam aqui. A IA volta quando o PRO voltar.',
        action: buy,
        tone: 'neutral',
      };
  }
}
