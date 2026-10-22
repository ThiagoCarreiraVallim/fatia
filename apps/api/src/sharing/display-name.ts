import { BadRequestException } from '@nestjs/common';

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
