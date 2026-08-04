import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { monthInTz } from './helpers/time-buckets';
import type { Cell } from './aggregation.service';
import type { Participant } from './stats-participation.port';

/**
 * Os recortes de comportamento do add-on pago (#160).
 *
 * **Este service não sabe agregar.** Ele monta células cruas exatamente como o
 * `EngagementService`, e quem aplica limiar e supressão continua sendo o
 * `suppress()` da #159, chamado num ponto só. Um `InsightsAggregator` próprio do
 * painel pago é o desenho que a seção "Ordem" da #160 proíbe: duas noções de
 * anonimização no mesmo produto significam que uma delas está errada e ninguém
 * sabe qual. Ser pago não compra exceção à supressão.
 *
 * Também vale para a origem dos números: aderência é **quantidade**, nunca
 * conteúdo. O plano do aluno não é lido — o que é contado é "sessão vinculada a
 * um plano" contra o total de sessões. Nenhuma carga, nenhum exercício
 * prescrito, nenhuma nota sai daqui, e `no-body-data.spec.ts` cobre este arquivo
 * junto com os da #159.
 */
@Injectable()
export class BehaviorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aderência ao plano por mês: sessões vinculadas a um plano sobre o total.
   *
   * `n` é o número de participantes que treinaram no mês — o denominador de
   * gente, não de sessões. É sobre ele que o limiar decide: um percentual
   * calculado sobre uma pessoa é o treino dessa pessoa com casas decimais.
   */
  async planAdherenceByMonth(participants: readonly Participant[], start: Date): Promise<Cell[]> {
    const fusos = new Map(participants.map((p) => [p.userId, p.timezone]));

    const rows = await this.prisma.workoutSession.findMany({
      where: { userId: { in: participants.map((p) => p.userId) }, startedAt: { gte: start } },
      select: { userId: true, startedAt: true, planId: true },
    });

    const porMes = new Map<string, { total: number; comPlano: number; pessoas: Set<string> }>();
    for (const row of rows) {
      const mes = monthInTz(row.startedAt, fusos.get(row.userId) ?? 'UTC');
      const balde = porMes.get(mes) ?? { total: 0, comPlano: 0, pessoas: new Set<string>() };
      balde.total += 1;
      if (row.planId !== null) balde.comPlano += 1;
      balde.pessoas.add(row.userId);
      porMes.set(mes, balde);
    }

    return [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, balde]) => ({
        key: mes,
        n: balde.pessoas.size,
        value: Math.round((balde.comPlano / balde.total) * 100),
      }));
  }

  /**
   * Retenção por coorte de entrada no grupo.
   *
   * O recorte mais perigoso dos quatro, e a razão está no percentual: uma coorte
   * antiga em que restou **uma** pessoa retida dá 100%, e 100% sobre uma coorte
   * cujo tamanho é conhecido diz exatamente quem. Por isso o `n` da célula é o
   * **tamanho da coorte** — o denominador —, e não o número de retidos: é o
   * denominador que precisa passar no limiar. A supressão complementar cuida do
   * resto, porque coorte pequena é o caso comum, não a exceção.
   */
  async retentionByCohort(participants: readonly Participant[], now: Date): Promise<Cell[]> {
    const trintaDias = new Date(now.getTime() - 30 * 86_400_000);

    const ativos = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: participants.map((p) => p.userId) },
        startedAt: { gte: trintaDias },
      },
      _count: { _all: true },
    });
    const retidos = new Set(ativos.map((row) => row.userId));

    const porCoorte = new Map<string, { tamanho: number; retidos: number }>();
    for (const participante of participants) {
      // Sem `joinedAt` a coorte é desconhecida, e "desconhecida" não é um balde:
      // seria um recorte com nome de vazio onde os casos estranhos se juntam.
      if (participante.joinedAt === null) continue;
      const coorte = monthInTz(participante.joinedAt, participante.timezone);
      const balde = porCoorte.get(coorte) ?? { tamanho: 0, retidos: 0 };
      balde.tamanho += 1;
      if (retidos.has(participante.userId)) balde.retidos += 1;
      porCoorte.set(coorte, balde);
    }

    return [...porCoorte.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([coorte, balde]) => ({
        key: coorte,
        n: balde.tamanho,
        value: Math.round((balde.retidos / balde.tamanho) * 100),
      }));
  }

  /**
   * Mix de modalidade por grupo muscular do que foi efetivamente treinado.
   *
   * A unidade é a **sessão**, não a série: contar séries daria peso a quem
   * registra mais detalhe, e um aluno meticuloso sozinho definiria o "mix da
   * academia". Um par (sessão, grupo muscular) conta uma vez.
   */
  async modalityMix(participants: readonly Participant[], start: Date): Promise<Cell[]> {
    const rows = await this.prisma.sessionSet.findMany({
      where: {
        session: {
          userId: { in: participants.map((p) => p.userId) },
          startedAt: { gte: start },
        },
      },
      select: {
        sessionId: true,
        session: { select: { userId: true } },
        exercise: { select: { muscleGroup: true } },
      },
    });

    const vistos = new Set<string>();
    const porGrupo = new Map<string, { sessoes: number; pessoas: Set<string> }>();

    for (const row of rows) {
      const chave = `${row.sessionId}|${row.exercise.muscleGroup}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const balde = porGrupo.get(row.exercise.muscleGroup) ?? {
        sessoes: 0,
        pessoas: new Set<string>(),
      };
      balde.sessoes += 1;
      balde.pessoas.add(row.session.userId);
      porGrupo.set(row.exercise.muscleGroup, balde);
    }

    return [...porGrupo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([grupo, balde]) => ({
        key: grupo,
        n: balde.pessoas.size,
        value: balde.sessoes,
      }));
  }
}
