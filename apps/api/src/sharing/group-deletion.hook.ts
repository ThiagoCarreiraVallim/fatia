/**
 * Passos que outros módulos dão **antes** de uma comunidade ser apagada.
 *
 * Hoje o único é da cobrança (ADR 025): cancelar no Asaas a assinatura dos
 * assentos, para a comunidade não seguir sendo cobrada depois de sumir. Mesmo
 * desenho do `ACCOUNT_DELETION_HOOKS`: declarado aqui, fornecido pelo
 * `billing/` como provider global. Um gancho que lança aborta a exclusão.
 */
export const GROUP_DELETION_HOOKS = Symbol('GROUP_DELETION_HOOKS');

export interface GroupDeletionHook {
  antesDeApagar(groupId: string): Promise<void>;
}
