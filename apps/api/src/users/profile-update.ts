import { BadRequestException } from '@nestjs/common';
import type {
  ActivityLevel,
  AvatarVisibility,
  BiologicalSex,
  BodyObjective,
  DistanceUnit,
  LoadUnit,
  Prisma,
} from '@prisma/client';
import { isCalendarDay } from '../progress/helpers/log-day';
import { todayInTz } from '../progress/helpers/date-tz';
import { cleanDisplayName } from '../sharing/display-name';

/** A bio do perfil (prancha Al-V9): opcional, até 140 caracteres. */
export const BIO_MAX = 140;

export interface ProfileUpdate {
  name?: string;
  heightCm?: number;
  timezone?: string;
  sex?: BiologicalSex;
  birthDate?: string;
  activityLevel?: ActivityLevel;
  objective?: BodyObjective;
  /** Vazio apaga: volta a valer o primeiro nome. */
  nickname?: string | null;
  /** Vazio apaga. */
  bio?: string | null;
  avatarVisibility?: AvatarVisibility;
  keepMealPhotos?: boolean;
  /** Vazio apaga o número (e desliga o "equipe pode me chamar"). */
  whatsapp?: string | null;
  whatsappOptIn?: boolean;
  loadUnit?: LoadUnit;
  distanceUnit?: DistanceUnit;
}

/**
 * O número como o WhatsApp entende (`wa.me/<dígitos>`): só dígitos, com o DDI.
 * Número nacional (10 ou 11 dígitos, com DDD) ganha o 55 do Brasil.
 */
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (full.length < 12 || full.length > 15) {
    throw new BadRequestException('O WhatsApp precisa ter DDD e número, como (65) 99812-3456.');
  }
  return full;
}

function cleanBio(raw: string): string | null {
  const bio = raw.trim();
  if (!bio) return null;
  if (bio.length > BIO_MAX) {
    throw new BadRequestException(`A bio tem no máximo ${BIO_MAX} caracteres.`);
  }
  if (/[<>]/.test(bio)) throw new BadRequestException('A bio não pode ter < ou >.');
  return bio;
}

function cleanNickname(raw: string | null): string | null {
  return raw === null || !raw.trim() ? null : cleanDisplayName(raw);
}

/** Mesmo `data` para o `PATCH /users/me` e o `update_me`: só o que veio é gravado. */
export function profileUpdateData(input: ProfileUpdate, timezone: string): Prisma.UserUpdateInput {
  if (input.birthDate !== undefined) {
    if (!isCalendarDay(input.birthDate) || input.birthDate > todayInTz(timezone)) {
      throw new BadRequestException('A data de nascimento não é válida.');
    }
  }
  const whatsapp =
    input.whatsapp === undefined
      ? undefined
      : input.whatsapp === null || !input.whatsapp.trim()
        ? null
        : normalizeWhatsapp(input.whatsapp);
  if (input.whatsappOptIn === true && whatsapp === null) {
    throw new BadRequestException('Informe o WhatsApp antes de deixar a equipe chamar.');
  }
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.heightCm !== undefined && { heightCm: input.heightCm }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    ...(input.sex !== undefined && { sex: input.sex }),
    ...(input.birthDate !== undefined && { birthDate: new Date(`${input.birthDate}T00:00:00Z`) }),
    ...(input.activityLevel !== undefined && { activityLevel: input.activityLevel }),
    ...(input.objective !== undefined && { objective: input.objective }),
    ...(input.nickname !== undefined && { nickname: cleanNickname(input.nickname) }),
    ...(input.bio !== undefined && { bio: input.bio === null ? null : cleanBio(input.bio) }),
    ...(input.avatarVisibility !== undefined && { avatarVisibility: input.avatarVisibility }),
    ...(input.keepMealPhotos !== undefined && { keepMealPhotos: input.keepMealPhotos }),
    // Apagar o número desliga a permissão junto: a equipe não tem como chamar sem ele.
    ...(whatsapp !== undefined && { whatsapp }),
    ...(whatsapp === null && { whatsappOptIn: false }),
    ...(input.whatsappOptIn !== undefined &&
      whatsapp !== null && { whatsappOptIn: input.whatsappOptIn }),
    ...(input.loadUnit !== undefined && { loadUnit: input.loadUnit }),
    ...(input.distanceUnit !== undefined && { distanceUnit: input.distanceUnit }),
  };
}
