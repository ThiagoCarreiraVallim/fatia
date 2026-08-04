import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CANONICAL_MUSCLE_GROUPS } from '../workout/helpers/muscle-group';
import { monthBuckets, monthInTz } from './helpers/time-buckets';
import type { Cell } from './aggregation.service';
import type { Participant } from './stats-participation.port';

/**
 * O eixo do `modality_mix`, **fechado**.
 *
 * `Exercise.muscleGroup` não é a lista canônica: `MUSCLE_GROUP_PATTERN` aceita
 * 50 caracteres de letras, espaços e hífens, e exercício custom é criado pelo
 * próprio aluno. Publicar a chave crua entregava ao dono da academia uma frase
 * escrita por **uma** pessoa ("reabilitacao ombro pos cirurgia") — e o limiar não
 * alcançava isso, porque ele decide sobre o valor e o `n`, não sobre a chave: a
 * célula saía com `value: null`, `n: null`, `suppressed: true` e o texto intacto,
 * na resposta e no CSV. A **existência** da célula era a divulgação.
 *
 * Tudo que não está na lista canônica vira `outros`. Não é sanitização de texto
 * (escapar `=HYPERLINK` continua sendo necessário no CSV, por outro motivo): é
 * fechar o eixo, que é a regra §4 da política aplicada ao único recorte que a
 * violava. De quebra, some a cardinalidade que o aluno controlava — cada texto
 * distinto era uma célula de uma pessoa.
 */
export const OUTRAS_MODALIDADES = 'outros';

export const MODALITY_AXIS: readonly string[] = [...CANONICAL_MUSCLE_GROUPS, OUTRAS_MODALIDADES];

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
  async planAdherenceByMonth(
    participants: readonly Participant[],
    start: Date,
    now: Date,
  ): Promise<Cell[]> {
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

    // O eixo vem da janela, não das linhas: mês sem sessão nenhuma é `0`, e não
    // uma lacuna. `contar()` já fazia isso nos recortes gratuitos, e o painel
    // pago estava omitindo o balde vazio — a assimetria que a revisão pegou.
    return monthBuckets(start, now, [...fusos.values()]).map((mes) => {
      const balde = porMes.get(mes);
      return {
        key: mes,
        n: balde?.pessoas.size ?? 0,
        value: balde === undefined ? 0 : Math.round((balde.comPlano / balde.total) * 100),
      };
    });
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
  async retentionByCohort(
    participants: readonly Participant[],
    start: Date,
    now: Date,
  ): Promise<Cell[]> {
    // O período é a **janela de retenção**: "retido" é ter treinado dentro dela.
    // Antes eram 30 dias fixos, e então `last_30_days` e `last_12_months`
    // devolviam a mesma célula com o carimbo de períodos diferentes — o período
    // entrava na resposta e no CSV sem entrar na conta.
    //
    // O período **não** escolhe as coortes: recortar o eixo pela janela esconderia
    // justamente a coorte antiga, que é o que este recorte existe para mostrar.
    // Como consequência boa, o eixo não depende da janela — e é o eixo que a
    // supressão complementar percorre para achar o vizinho.
    const ativos = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: participants.map((p) => p.userId) },
        startedAt: { gte: start },
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

    // O eixo vai da coorte mais antiga até hoje, **sem buraco**: mês em que
    // ninguém entrou é `0`, e não uma lacuna que o leitor preenche sozinho.
    const primeiraEntrada = participants
      .map((p) => p.joinedAt)
      .filter((data): data is Date => data !== null)
      .reduce<Date | null>((menor, data) => (menor === null || data < menor ? data : menor), null);

    if (primeiraEntrada === null) return [];

    const fusos = participants.map((p) => p.timezone);
    return monthBuckets(primeiraEntrada, now, fusos).map((coorte) => {
      const balde = porCoorte.get(coorte);
      return {
        key: coorte,
        n: balde?.tamanho ?? 0,
        value: balde === undefined ? 0 : Math.round((balde.retidos / balde.tamanho) * 100),
      };
    });
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
      const grupo = modalidade(row.exercise.muscleGroup);
      const chave = `${row.sessionId}|${grupo}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const balde = porGrupo.get(grupo) ?? { sessoes: 0, pessoas: new Set<string>() };
      balde.sessoes += 1;
      balde.pessoas.add(row.session.userId);
      porGrupo.set(grupo, balde);
    }

    return MODALITY_AXIS.map((grupo) => {
      const balde = porGrupo.get(grupo);
      return { key: grupo, n: balde?.pessoas.size ?? 0, value: balde?.sessoes ?? 0 };
    });
  }
}

/** Grupo muscular fora da lista canônica não vira eixo — vira `outros`. */
function modalidade(muscleGroup: string): string {
  const normalizado = muscleGroup.trim().toLowerCase();
  return MODALITY_AXIS.includes(normalizado) && normalizado !== OUTRAS_MODALIDADES
    ? normalizado
    : OUTRAS_MODALIDADES;
}
