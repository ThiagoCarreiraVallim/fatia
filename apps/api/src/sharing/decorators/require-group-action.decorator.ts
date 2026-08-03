import { SetMetadata } from '@nestjs/common';
import type { GroupAction } from '../permissions';

export const GROUP_ACTION_KEY = 'sharing:group-action';
export const SELF_ONLY_KEY = 'sharing:self-only';

/**
 * Declara qual ação administrativa a rota exerce. O `GroupRoleGuard` lê o
 * `:groupId` da URL, resolve a associação de quem chamou e confronta com
 * `permissions.ts`.
 *
 * Só faz sentido em rota que tenha `:groupId` — sem ele o guarda não tem grupo
 * em que conferir papel, e falha alto em vez de deixar passar.
 */
export const RequireGroupAction = (action: GroupAction) => SetMetadata(GROUP_ACTION_KEY, action);

/**
 * Declara que a rota age **sobre quem chamou**, e por isso papel de grupo não
 * decide nada: criar grupo, listar os meus, pedir para entrar, sair, consentir
 * e revogar o próprio consentimento.
 *
 * Não tem efeito em runtime — é declaração de intenção. O que dá valor a ela é
 * o teste estrutural: todo método público dos controllers de `sharing/` precisa
 * ter `@RequireGroupAction` **ou** `@SelfOnly`, sem terceiro estado. Sem isso, a
 * falha provável não é a matriz errada, é o decorator **esquecido** numa rota
 * nova — que passaria despercebida justamente por não haver nada a comparar.
 */
export const SelfOnly = () => SetMetadata(SELF_ONLY_KEY, true);
