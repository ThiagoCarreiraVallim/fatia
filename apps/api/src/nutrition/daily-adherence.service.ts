import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';

/** Quem é avaliado e em que calendário estão os registros dele. */
export interface AdherenceSubject {
  userId: string;
  timezone: string;
}

/**
 * Os dias de uma pessoa em que ela bateu a própria meta — só as datas.
 *
 * É o formato inteiro da resposta, e é de propósito (ADR 027): quem recebe isto
 * fica sabendo "no dia 03/03 a pessoa ficou dentro da faixa dela", nunca quanto
 * ela comeu nem qual é a faixa. O desafio de grupo (`social/`) só enxerga este
 * tipo.
 */
export interface AdherenceDays {
  /** Calorias do dia dentro da faixa `kcalMin`–`kcalMax` da pessoa. */
  kcalInRange: Set<string>;
  /** Proteína do dia pelo menos no mínimo da pessoa. */
  proteinTarget: Set<string>;
  /** Dia com pelo menos uma refeição registrada. */
  mealLogged: Set<string>;
}

/**
 * Aderência diária à meta de nutrição (Fase 8a, ADR 027).
 *
 * Mora em `nutrition/`, e não em `social/`, porque lê refeição: a pasta do
 * desafio é proibida de tocar em dado de alimentação (`no-body-comparison`), e
 * o que atravessa a fronteira é este conjunto de datas.
 *
 * A meta é a **atual** da pessoa (`UserGoals` não guarda histórico). Sem meta, o
 * dia não conta nem a favor nem contra — a tela de entrada no desafio avisa.
 */
@Injectable()
export class DailyAdherenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Avalia os dias `first`–`last` (YYYY-MM-DD, inclusivos) de cada pessoa, no
   * dia local de cada uma.
   */
  async forDays(
    subjects: readonly AdherenceSubject[],
    first: string,
    last: string,
  ): Promise<Map<string, AdherenceDays>> {
    const resultado = new Map<string, AdherenceDays>();
    if (subjects.length === 0) return resultado;
    for (const s of subjects) {
      resultado.set(s.userId, {
        kcalInRange: new Set(),
        proteinTarget: new Set(),
        mealLogged: new Set(),
      });
    }

    const ids = subjects.map((s) => s.userId);
    // Faixa larga de instantes que cobre os dias em todo fuso; o recorte que vale
    // é o do dia local, logo abaixo.
    const abertura = Math.min(
      ...subjects.map((s) => dayBoundsInTz(first, s.timezone).start.getTime()),
    );
    const virada = Math.max(...subjects.map((s) => dayBoundsInTz(last, s.timezone).end.getTime()));

    const [metas, refeicoes] = await Promise.all([
      this.prisma.userGoals.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, kcalMin: true, kcalMax: true, proteinMinG: true },
      }),
      this.prisma.meal.findMany({
        where: { userId: { in: ids }, eatenAt: { gte: new Date(abertura), lt: new Date(virada) } },
        select: { userId: true, eatenAt: true, items: { select: { kcal: true, proteinG: true } } },
      }),
    ]);

    const fusoDe = new Map(subjects.map((s) => [s.userId, s.timezone]));
    const totais = new Map<string, Map<string, { kcal: number; proteinG: number }>>();
    for (const r of refeicoes) {
      const dia = dateInTz(r.eatenAt, fusoDe.get(r.userId)!);
      if (dia < first || dia > last) continue;
      const porDia = totais.get(r.userId) ?? new Map<string, { kcal: number; proteinG: number }>();
      const t = porDia.get(dia) ?? { kcal: 0, proteinG: 0 };
      for (const item of r.items) {
        t.kcal += item.kcal;
        t.proteinG += item.proteinG;
      }
      porDia.set(dia, t);
      totais.set(r.userId, porDia);
    }

    const metaDe = new Map(metas.map((m) => [m.userId, m]));
    for (const [userId, porDia] of totais) {
      const dias = resultado.get(userId)!;
      const meta = metaDe.get(userId);
      for (const [dia, t] of porDia) {
        dias.mealLogged.add(dia);
        if (!meta) continue;
        // Arredonda como a tela mostra: 1.999,6 kcal aparece como 2.000 e tem
        // de contar como 2.000.
        const kcal = Math.round(t.kcal);
        if (kcal >= meta.kcalMin && kcal <= meta.kcalMax) dias.kcalInRange.add(dia);
        if (Math.round(t.proteinG) >= meta.proteinMinG) dias.proteinTarget.add(dia);
      }
    }
    return resultado;
  }
}
