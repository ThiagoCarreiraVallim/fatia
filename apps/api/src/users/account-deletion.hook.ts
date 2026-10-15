/**
 * Passos que outros módulos precisam dar **antes** de a conta ser apagada.
 *
 * Hoje o único é da cobrança (ADR 024): encerrar a assinatura no Asaas, para
 * ninguém ser cobrado depois de sair. O gancho é declarado aqui, do lado da
 * conta, e fornecido pelo `billing/` como provider global — assim `users/` não
 * importa nada de cobrança (`no-billing-in-student-surface.spec.ts`).
 *
 * Um gancho que lança **aborta** a deleção com a conta inteira: é melhor a
 * pessoa tentar de novo do que perder a conta e continuar sendo cobrada.
 */
export const ACCOUNT_DELETION_HOOKS = Symbol('ACCOUNT_DELETION_HOOKS');

export interface AccountDeletionHook {
  antesDeApagar(userId: string): Promise<void>;
}
