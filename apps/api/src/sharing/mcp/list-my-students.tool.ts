import { Injectable } from '@nestjs/common';
import { StudentViewService } from '../student-view.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListMyStudentsTool implements McpToolDef {
  constructor(private readonly students: StudentViewService) {}
  readonly name = 'list_my_students';
  readonly title = 'Meus alunos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Alunos que o profissional atende nas academias em que ele é PROFESSIONAL, com o que cada um ' +
    'autorizou ele a ver. Devolve só composição de grupo — nome, academia e categorias ' +
    'autorizadas —, nunca dado de saúde. Aluno com a lista de categorias vazia ainda não ' +
    'autorizou nada: use o membershipId dele para pedir a autorização, e não para tentar ler.';
  /**
   * Sem input: os grupos saem do contexto autenticado. Um `groupId` opcional
   * aqui só serviria para filtrar no cliente, e daria a um autenticado qualquer
   * uma sonda de existência de grupo em troca de nada.
   */
  readonly inputSchema = {} as const;
  async execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.students.listStudents(userId);
  }
}
