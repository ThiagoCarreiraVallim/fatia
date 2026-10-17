/**
 * Passos que outros módulos precisam dar **antes** de a conta ser apagada.
 *
 * Encerrar a assinatura no Asaas (ADR 024), para ninguém ser cobrado depois de
 * sair, e apagar do bucket os arquivos da pessoa (ADR 028). Os ganchos são
 * declarados aqui, do lado da conta, e fornecidos pelo `DeletionHooksModule`
 * como provider global — assim `users/` não importa nada de cobrança
 * (`no-billing-in-student-surface.spec.ts`).
 *
 * Um gancho que lança **aborta** a deleção com a conta inteira: é melhor a
 * pessoa tentar de novo do que perder a conta e continuar sendo cobrada.
 */
export const ACCOUNT_DELETION_HOOKS = Symbol('ACCOUNT_DELETION_HOOKS');

export interface AccountDeletionHook {
  beforeDelete(userId: string): Promise<void>;
}
