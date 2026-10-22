import { BadRequestException } from '@nestjs/common';
import type { ActivityLevel, BiologicalSex, BodyObjective, Prisma } from '@prisma/client';
import { isCalendarDay } from '../progress/helpers/log-day';
import { todayInTz } from '../progress/helpers/date-tz';

export interface ProfileUpdate {
  name?: string;
  heightCm?: number;
  timezone?: string;
  sex?: BiologicalSex;
  birthDate?: string;
  activityLevel?: ActivityLevel;
  objective?: BodyObjective;
}

/** Mesmo `data` para o `PATCH /users/me` e o `update_me`: só o que veio é gravado. */
export function profileUpdateData(input: ProfileUpdate, timezone: string): Prisma.UserUpdateInput {
  if (input.birthDate !== undefined) {
    if (!isCalendarDay(input.birthDate) || input.birthDate > todayInTz(timezone)) {
      throw new BadRequestException('A data de nascimento não é válida.');
    }
  }
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.heightCm !== undefined && { heightCm: input.heightCm }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    ...(input.sex !== undefined && { sex: input.sex }),
    ...(input.birthDate !== undefined && { birthDate: new Date(`${input.birthDate}T00:00:00Z`) }),
    ...(input.activityLevel !== undefined && { activityLevel: input.activityLevel }),
    ...(input.objective !== undefined && { objective: input.objective }),
  };
}
