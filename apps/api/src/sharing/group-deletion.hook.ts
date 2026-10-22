/**
 * Passos que outros módulos dão **antes** de uma comunidade ser apagada.
 *
 * Cancelar no Asaas a assinatura dos assentos (ADR 025), para a comunidade não
 * seguir sendo cobrada depois de sumir, e apagar do bucket os arquivos dela
 * (ADR 028). Mesmo desenho do `ACCOUNT_DELETION_HOOKS`: declarado aqui,
 * fornecido pelo `DeletionHooksModule` como provider global. Um gancho que
 * lança aborta a exclusão.
 */
export const GROUP_DELETION_HOOKS = Symbol('GROUP_DELETION_HOOKS');

export interface GroupDeletionHook {
  beforeDelete(groupId: string): Promise<void>;
}
