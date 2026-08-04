import { SetMetadata } from '@nestjs/common';
import type { GroupAction } from '../permissions';

export const GROUP_ACTION_KEY = 'sharing:group-action';
export const SELF_ONLY_KEY = 'sharing:self-only';
export const CONSENT_GOVERNED_KEY = 'sharing:consent-governed';

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
 * ter uma das três declarações desta lista, sem estado "nenhuma". Sem isso, a
 * falha provável não é a matriz errada, é o decorator **esquecido** numa rota
 * nova — que passaria despercebida justamente por não haver nada a comparar.
 */
export const SelfOnly = () => SetMetadata(SELF_ONLY_KEY, true);

/**
 * Declara que a rota lê dado de **outra pessoa**, e que quem autoriza é o
 * consentimento — nunca o papel de grupo (#157).
 *
 * É a terceira camada, e ela nasceu com o painel do profissional. As outras
 * duas não serviam, e usar qualquer uma seria registrar uma mentira no código:
 *
 * - `@RequireGroupAction` decide por papel, e `docs/PERMISSIONS.md` diz o
 *   oposto para leitura de titular ("papel NÃO decide — vínculo decide"). Além
 *   disso o guarda exige `:groupId` na URL, que estas rotas não têm: o grupo sai
 *   da associação lida, não do input.
 * - `@SelfOnly` afirma que a rota age sobre quem chamou. Numa leitura delegada
 *   isso é falso, e a declaração existe justamente para ser lida por quem
 *   revisa.
 *
 * Sem efeito em runtime, como `@SelfOnly`: quem barra é
 * `ProfessionalAccessService.assertReadable`, dentro do service. O que o teste
 * estrutural cobra é que a rota **enderece o titular pela associação** — o
 * `:membershipId` da URL —, porque é isso que impede a variante que a ADR 014
 * proíbe: resolver o aluno por um id de usuário vindo de fora.
 */
export const ConsentGoverned = () => SetMetadata(CONSENT_GOVERNED_KEY, true);
