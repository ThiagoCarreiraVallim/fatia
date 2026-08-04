import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ShareScope } from '@fatia/db';
import { StudentViewService } from '../student-view.service';
import { DIAS_MAX, DIAS_MIN, DIAS_PADRAO } from '../dto/student-view.dto';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

/**
 * A única tool do produto que lê dado de OUTRA pessoa (ADR 014).
 *
 * O aluno entra por `membershipId` — a associação dele numa academia —, jamais
 * por identidade de usuário: `tool-user-scoping.spec.ts` reprova
 * `student_id`, `subject_id` e companhia justamente porque esta tool era o
 * desenho tentador. O id de input **encontra** um candidato; quem autoriza é o
 * vínculo consentido, resolvido por `StudentViewService` na porta única,
 * `ProfessionalAccessService.assertReadable`.
 *
 * `readOnlyHint: true` não é etiqueta: não existe escrita em nome de aluno em
 * lugar nenhum. A direção profissional → aluno é oferta + aceite, e o aceite
 * roda sob o `userId` do próprio aluno.
 */
@Injectable()
@McpTool()
export class GetStudentProgressTool implements McpToolDef {
  constructor(private readonly students: StudentViewService) {}
  readonly name = 'get_student_progress';
  readonly title = 'Acompanhar um aluno';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lê UMA categoria de dados de UM aluno que autorizou este profissional. As categorias são ' +
    'independentes: uma chamada por categoria, e cada uma é conferida contra o que aquele aluno ' +
    'consentiu. Use list_my_students antes, para saber quem autorizou o quê — pedir uma ' +
    'categoria não autorizada devolve a mesma resposta de aluno inexistente, e fica registrado ' +
    'na trilha que o aluno lê. Nunca escreve nada: para entregar um plano ao aluno, monte na ' +
    'própria conta e ofereça, porque só o aceite dele cria o plano na conta dele.';
  readonly inputSchema = {
    membershipId: z
      .string()
      .describe('ID da associação do ALUNO na academia, como devolvido por list_my_students'),
    scope: z
      .nativeEnum(ShareScope)
      .describe(
        'A categoria lida, uma só: WORKOUT (planos, sessões e volume), NUTRITION (histórico ' +
          'alimentar), BODY (peso), HABITS (água e passos) ou GOALS (metas)',
      ),
    days: z
      .number()
      .int()
      .min(DIAS_MIN)
      .max(DIAS_MAX)
      .optional()
      .describe(
        `Janela das séries temporais em dias, de ${DIAS_MIN} a ${DIAS_MAX} (padrão ${DIAS_PADRAO})`,
      ),
  } as const;
  async execute(
    { membershipId, scope, days }: { membershipId: string; scope: ShareScope; days?: number },
    { userId }: McpToolContext,
  ) {
    // `userId` é o do PROFISSIONAL, do contexto. O do aluno sai da porta, e o
    // fuso usado para cortar os dias é o dele — não o de quem está lendo.
    return this.students.read(userId, membershipId, scope, days ?? DIAS_PADRAO);
  }
}
