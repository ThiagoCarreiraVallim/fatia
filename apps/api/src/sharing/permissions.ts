import { GroupRole } from '@fatia/db';

/**
 * Matriz de papéis do grupo (#156). Função pura: sem Prisma, sem Nest, sem
 * request.
 *
 * **Papel e consentimento são dois mecanismos, em camadas distintas.** Esta
 * tabela governa **administração de grupo** — aprovar entrada, remover membro,
 * ver fatura, publicar conteúdo — e é conferida no pipeline da requisição pelo
 * `GroupRoleGuard`. Ela **não** governa leitura de dado de saúde: quem governa
 * isso é `ProfessionalLink`, conferido por `ProfessionalAccessService`, e
 * nenhum papel — nem `OWNER`, nem `Role.ADMIN` da plataforma — concede leitura
 * sozinho. A equipe (OWNER, PROFESSIONAL, CREATOR) só lê com o vínculo que o
 * titular deu ao entrar ou depois (ADR 026).
 *
 * Fundir as duas coisas num guard único obrigaria toda rota de domínio a rodar
 * uma checagem de grupo para descobrir se aquela leitura é do próprio dono ou
 * de um aluno. Seria "espalhar consciência de grupo pelos services" um andar
 * acima, que é exatamente o desenho que a ADR 014 rejeitou.
 *
 * O documento legível é `docs/PERMISSIONS.md`, e ele **não** é prosa solta:
 * `permission-matrix.spec.ts` parseia as duas tabelas de lá e confronta com
 * este arquivo nos dois sentidos.
 */

/**
 * Papéis autorizados por ação. Sem herança e sem hierarquia: `OWNER` não
 * "herda" o que `PROFESSIONAL` pode, senão gerir a academia passaria a incluir,
 * de graça, tudo que atender aluno inclui — que é a armadilha do acúmulo de
 * papéis com um nome respeitável.
 */
export const GROUP_PERMISSIONS = {
  /** Ver nome, tipo e slug do grupo de que já se faz parte. */
  'group.read': [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR, GroupRole.MEMBER],
  'group.update': [GroupRole.OWNER],
  'group.delete': [GroupRole.OWNER],
  /** Passar a comunidade (e a cobrança) para outra pessoa da equipe. */
  'group.transfer': [GroupRole.OWNER],
  /**
   * `PROFESSIONAL` convida, mas só como `MEMBER` — quem define a equipe é o
   * dono. A restrição por papel convidado fica no `InviteService`.
   */
  'invite.create': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  'invite.revoke': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  /**
   * Todo membro lista — mas **o que** cada um enxerga é decisão do
   * `MembershipService`, não desta tabela: `MEMBER` e `CREATOR` recebem só quem
   * administra ou atende, mais eles mesmos. A matriz decide **se** a rota abre;
   * a projeção do resultado é do service. Marcar `MEMBER` como "não" aqui
   * fecharia a tela em que o aluno confere quem é o profissional dele.
   */
  'member.list': [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR, GroupRole.MEMBER],
  /** Aprovar pedido de entrada e definir o papel de quem entra. */
  'member.approve': [GroupRole.OWNER],
  'member.remove': [GroupRole.OWNER],
  /**
   * Mudar o papel de quem já está dentro. Só o dono, como aprovar: quem define a
   * equipe é ele, e virar equipe é passar a receber o que os membros consentiram.
   */
  'member.role': [GroupRole.OWNER],
  /** Gerir o negócio não implica ver dado de saúde — e o inverso também. */
  'billing.read': [GroupRole.OWNER],
  'billing.manage': [GroupRole.OWNER],
  'content.publish': [GroupRole.PROFESSIONAL, GroupRole.CREATOR],
  /** `PROFESSIONAL` não modera: acumular seria a mesma armadilha. */
  'content.moderate': [GroupRole.OWNER, GroupRole.CREATOR],
  'offer.create': [GroupRole.PROFESSIONAL],
  /**
   * Painel agregado do dono. O profissional já tem o caminho individual, com
   * consentimento; dar-lhe também o agregado seria dois caminhos para a mesma
   * informação com regras diferentes.
   */
  'insights.read': [GroupRole.OWNER],
} as const satisfies Record<string, readonly GroupRole[]>;

/**
 * União literal derivada do mapa. É o que faz `can(role, 'grupo.apagar')` não
 * compilar: ação nova sem linha na tabela é erro de tipo, não `false` silencioso.
 */
export type GroupAction = keyof typeof GROUP_PERMISSIONS;

/** Todas as ações, em ordem estável. Usada pelo guarda da doc. */
export const GROUP_ACTIONS = Object.keys(GROUP_PERMISSIONS) as GroupAction[];

/** O papel autoriza a ação administrativa? Nada além do mapa é consultado. */
export function can(role: GroupRole, action: GroupAction): boolean {
  return (GROUP_PERMISSIONS[action] as readonly GroupRole[]).includes(role);
}

/**
 * Ações que a associação ainda **pendente** (`INVITED`) já exerce.
 *
 * Pedir para entrar cria a associação em `INVITED`, e ela já aparece em
 * `GET /groups` — é a tela "aguardando aprovação". Exigir `ACTIVE` para **toda**
 * ação faria o grupo estar na lista e responder `NOT_FOUND` ao ser aberto por
 * id: exatamente a incoerência que o `STATUS_VIVOS` de `group.service.ts` existe
 * para eliminar, só que reintroduzida um andar acima, no guarda.
 *
 * O que a pendência **não** concede é administrar nem enxergar gente: aprovar,
 * remover, listar membros, faturar e publicar exigem associação ativa. Quem
 * ainda não foi aprovado vê o cartão do grupo e nada mais.
 *
 * A tabela legível está em `docs/PERMISSIONS.md` e é conferida nos dois
 * sentidos por `permission-matrix.spec.ts`.
 */
export const PENDING_MEMBERSHIP_ACTIONS = ['group.read'] as const satisfies readonly GroupAction[];

/** A ação já vale para quem está aguardando aprovação? */
export function canWhilePending(action: GroupAction): boolean {
  return (PENDING_MEMBERSHIP_ACTIONS as readonly GroupAction[]).includes(action);
}

/**
 * Papéis que podem **receber** um `ProfessionalLink`: a equipe da comunidade
 * (ADR 026).
 *
 * "Pode receber" não é "tem": o vínculo só existe se o titular criar — ao
 * entrar, escolhendo os escopos, ou depois —, e é ele que autoriza a leitura.
 * Esta lista é a trava mínima do outro lado: `MEMBER` nunca figura como
 * destinatário, para que estar no mesmo grupo não vire caminho de ver o dado
 * de outro membro. `assertReadable` confere a mesma coisa de novo, na leitura:
 * são duas linhas de defesa contra o mesmo abuso, de propósito.
 */
export const ROLES_ELIGIBLE_FOR_LINK: readonly GroupRole[] = [
  GroupRole.OWNER,
  GroupRole.PROFESSIONAL,
  GroupRole.CREATOR,
];

/** A equipe da comunidade: quem recebe o consentimento dado ao entrar. */
export const TEAM_ROLES = ROLES_ELIGIBLE_FOR_LINK;

/** O papel pode ser destinatário de consentimento de leitura? */
export function canReceiveLink(role: GroupRole): boolean {
  return ROLES_ELIGIBLE_FOR_LINK.includes(role);
}
