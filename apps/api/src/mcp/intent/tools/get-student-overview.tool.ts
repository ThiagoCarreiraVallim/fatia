import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { DIAS_PADRAO } from '../../../sharing/dto/student-view.dto';
import { StudentViewService } from '../../../sharing/student-view.service';
import { escolherPorNome, IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * O aluno pelo nome (`list_my_students`) e a leitura de UMA categoria dele
 * (`get_student_progress`), que registra o acesso na trilha que o aluno vê — a mesma perna,
 * com a mesma trilha.
 */
@Injectable()
@McpTool()
export class GetStudentOverviewTool extends IntentTool<'get_student_overview'> {
  constructor(private readonly students: StudentViewService) {
    super('get_student_overview');
  }

  async execute(input: IntentInput<'get_student_overview'>, { userId }: McpToolContext) {
    const alunos = await this.students.listStudents(userId); // list_my_students
    const aluno = escolherPorNome(input.student, alunos, (a) => a.name, 'aluno');
    const progress = await this.students.read(
      userId,
      aluno.membershipId,
      input.scope,
      input.days ?? DIAS_PADRAO,
    ); // get_student_progress
    return { student: aluno, scope: input.scope, progress };
  }
}
