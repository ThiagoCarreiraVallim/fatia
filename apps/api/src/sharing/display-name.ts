import { BadRequestException } from '@nestjs/common';
import { isProvisionalName } from '../users/provisional-name';

/**
 * O apelido na comunidade (`GroupMembership.displayName`): como a pessoa
 * aparece no ranking dos desafios (Fase 8a) e no mural (Fase 8b). É o único
 * nome dela que os outros membros leem.
 */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;
/** Uma linha, sem caractere de controle nem `<`/`>`. */
export const DISPLAY_NAME_PATTERN = /^[^\p{Cc}<>]+$/u;

export function cleanDisplayName(raw: string): string {
  const nome = raw.trim().replace(/\s+/g, ' ');
  if (nome.length < DISPLAY_NAME_MIN || nome.length > DISPLAY_NAME_MAX) {
    throw new BadRequestException(
      `O apelido precisa ter de ${DISPLAY_NAME_MIN} a ${DISPLAY_NAME_MAX} caracteres`,
    );
  }
  if (!DISPLAY_NAME_PATTERN.test(nome)) {
    throw new BadRequestException('O apelido não pode ter quebra de linha nem < ou >');
  }
  return nome;
}

/** O apelido sugerido a quem ainda não tem um: o primeiro nome da conta. */
export function firstName(name: string): string {
  const primeiro = name.trim().split(/\s+/)[0] ?? '';
  return primeiro.length >= DISPLAY_NAME_MIN ? primeiro.slice(0, DISPLAY_NAME_MAX) : 'Participante';
}

/**
 * O nome de alguém na comunidade, de um lugar só: o apelido escolhido para esta
 * comunidade, senão o apelido do perfil (Você, #387), senão o primeiro nome da
 * conta. Ninguém precisa digitar um nome para postar ou entrar num desafio.
 *
 * O apelido do perfil aceita até 60 caracteres; aqui ele cabe no tamanho do
 * apelido da comunidade, que é o que o ranking e o mural mostram.
 */
export function communityName(m: {
  displayName: string | null;
  user: { nickname: string | null; name: string; email?: string; logtoSub?: string };
}): string {
  const escolhido = m.displayName?.trim();
  if (escolhido) return escolhido;
  const doPerfil = m.user.nickname?.trim().replace(/\s+/g, ' ');
  if (doPerfil) return doPerfil.slice(0, DISPLAY_NAME_MAX);
  // O `sub` ou o pedaço do e-mail no lugar do nome não vão ao mural (ADR 050).
  const { email, logtoSub } = m.user;
  if (email !== undefined && logtoSub !== undefined) {
    if (isProvisionalName({ name: m.user.name, email, logtoSub }))
      return PROVISIONAL_COMMUNITY_NAME;
  }
  return firstName(m.user.name);
}

/** Como aparece quem ainda não tem nome escolhido. */
export const PROVISIONAL_COMMUNITY_NAME = 'Membro';

/** O `select` do usuário que `communityName` precisa. */
export const COMMUNITY_NAME_USER_SELECT = {
  name: true,
  nickname: true,
  email: true,
  logtoSub: true,
} as const;
