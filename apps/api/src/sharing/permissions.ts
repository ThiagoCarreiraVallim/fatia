import { GroupRole, ShareScope } from '@fatia/db';

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
  'group.read': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  'group.update': [GroupRole.OWNER, GroupRole.ADMIN],
  'group.delete': [GroupRole.OWNER],
  /** Passar a comunidade (e a cobrança) para outra pessoa da equipe. */
  'group.transfer': [GroupRole.OWNER],
  /**
   * `PROFESSIONAL` convida, mas só como `MEMBER` — quem define a equipe é o
   * dono. A restrição por papel convidado fica no `InviteService`.
   */
  'invite.create': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL],
  'invite.revoke': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL],
  /**
   * Todo membro lista — mas **o que** cada um enxerga é decisão do
   * `MembershipService`, não desta tabela: `MEMBER` e `CREATOR` recebem só quem
   * administra ou atende, mais eles mesmos. A matriz decide **se** a rota abre;
   * a projeção do resultado é do service. Marcar `MEMBER` como "não" aqui
   * fecharia a tela em que o aluno confere quem é o profissional dele.
   */
  'member.list': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * Aprovar pedido de entrada e definir o papel de quem entra. A recepção (#404)
   * aprova no balcão, só como membro; o papel que cada um pode dar está em
   * `rolesGrantableBy`.
   */
  'member.approve': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.RECEPTION],
  'member.remove': [GroupRole.OWNER, GroupRole.ADMIN],
  /**
   * Mudar o papel de quem já está dentro. O dono e o administrador (#404); o
   * administrador não mexe no dono nem em outro administrador e não dá o papel
   * de administrador (`canManageMember`, `rolesGrantableBy`).
   */
  'member.role': [GroupRole.OWNER, GroupRole.ADMIN],
  /**
   * Escolher quem da equipe acompanha cada membro (#401, "Acompanhado por" e
   * "Trocar responsável"). É administração, não leitura: quem lê dado de saúde
   * continua sendo o `ProfessionalLink` que o membro deu.
   */
  'member.assign': [GroupRole.OWNER, GroupRole.ADMIN],
  /** Gerir o negócio não implica ver dado de saúde — e o inverso também. */
  'billing.read': [GroupRole.OWNER],
  'billing.manage': [GroupRole.OWNER],
  /**
   * Publicar planos prontos e dicas (Fase 7). O dono entra: numa academia é
   * ela quem publica o conteúdo da casa. Publicar não dá leitura de dado de
   * ninguém — é escrever para a comunidade, não ler dela.
   */
  'content.publish': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL, GroupRole.CREATOR],
  /** Ver e adotar o conteúdo publicado. Rascunho é da equipe, e o service filtra. */
  'content.read': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * `PROFESSIONAL` não modera: acumular seria a mesma armadilha. O `CREATOR`
   * deixou de moderar na #404 (prancha Pn-19 e ADR 043): ele publica.
   */
  'content.moderate': [GroupRole.OWNER, GroupRole.ADMIN],
  'offer.create': [GroupRole.PROFESSIONAL],
  /**
   * Marcar, mudar antes de começar, encerrar e apagar desafios (Fase 8a). É
   * a equipe que anima a comunidade; o ranking continua só de quem participa.
   */
  'challenge.manage': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL, GroupRole.CREATOR],
  /** Ver os desafios e entrar ou sair com um apelido (opt-in, ADR 027). */
  'challenge.join': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * A fila "Para revisar" dos desafios (#395, ADR 044 e 047): ver a foto de prova
   * e decidir "Vale" ou "Anular" com motivo. Só a equipe; sinalizar é `challenge.join`.
   */
  'challenge.review': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL, GroupRole.CREATOR],
  /** Ler o mural, reagir, comentar e denunciar (Fase 8b, ADR 032). */
  'post.read': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * Publicar no mural. A tabela abre para todos; a comunidade pode fechar para
   * a equipe (`Group.postPolicy`), e quem confere é o `PostService`.
   */
  'post.create': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * Comunicados (#394): notificação a todos, agendada ou repetida, e aviso no
   * topo do mural. Não modera: a fila de denúncias segue em `content.moderate`.
   */
  'announcement.publish': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.RECEPTION,
  ],
  /** Banir é mais forte que remover membro: fica com quem remove. */
  'member.ban': [GroupRole.OWNER, GroupRole.ADMIN],
  /**
   * Painel agregado do dono. O profissional já tem o caminho individual, com
   * consentimento; dar-lhe também o agregado seria dois caminhos para a mesma
   * informação com regras diferentes.
   */
  'insights.read': [GroupRole.OWNER],
  /**
   * Abrir o painel da equipe (#398): os contadores do menu e a Visão geral. O
   * que cada contador e cada cartão mostra segue a ação própria dele
   * (`member.approve`, `invite.create`, `content.moderate`, `challenge.review`,
   * `insights.read`); esta ação só abre a porta.
   */
  'panel.overview': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL, GroupRole.RECEPTION],
  /**
   * A busca ⌘K do painel (#398): nomes de membros, telas e planos da
   * biblioteca, nunca dado de saúde. Telas e planos dependem das ações de cada
   * um, então um papel só com esta ação (a Recepção, #404) vê só nomes.
   */
  'panel.search': [GroupRole.OWNER, GroupRole.ADMIN, GroupRole.PROFESSIONAL, GroupRole.RECEPTION],
  /**
   * A ficha da pessoa (#402): planos que a equipe mandou, anotações, agenda
   * planejada e quem abriu a ficha. Dado de saúde segue o vínculo, nunca o papel.
   */
  'member.file': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  /**
   * Mandar, terminar, apagar e reordenar os planos de uma pessoa (#402). Mandar
   * também exige `ProfessionalLink` ativo; apagar é do autor ou do dono.
   */
  'member.plans': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  /** Anotar na ficha (#402). A pessoa vê a anotação; editar é do autor ou do dono. */
  'member.note': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  /**
   * "Para revisar", "Em risco" e a sessão feita (#399). O papel abre a tela;
   * cada pessoa só aparece com vínculo ativo com quem olha, e cada dado de
   * saúde passa pela porta de leitura. Comentar exige Treino liberado.
   */
  'panel.review': [GroupRole.OWNER, GroupRole.PROFESSIONAL],
  /** Ver os descontos de parceiros da comunidade (#393). */
  'benefit.read': [
    GroupRole.OWNER,
    GroupRole.ADMIN,
    GroupRole.PROFESSIONAL,
    GroupRole.CREATOR,
    GroupRole.RECEPTION,
    GroupRole.MEMBER,
  ],
  /**
   * Cadastrar, mudar e tirar benefício de parceiro (#393). Só o dono: é acordo
   * comercial da comunidade, como a cobrança.
   */
  'benefit.manage': [GroupRole.OWNER],
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

/**
 * Quem recebe o consentimento dado ao entrar (ADR 026). Não é a equipe toda:
 * administrador e recepção (#404) são da equipe e nunca recebem vínculo.
 */
export const TEAM_ROLES = ROLES_ELIGIBLE_FOR_LINK;

/**
 * A equipe da comunidade, para o que não é leitura de dado: publicar no mural
 * em nome da comunidade, aparecer em "Equipe" (#404). Nunca use esta lista
 * para decidir quem lê.
 */
export const STAFF_ROLES: readonly GroupRole[] = [
  GroupRole.OWNER,
  GroupRole.ADMIN,
  GroupRole.PROFESSIONAL,
  GroupRole.CREATOR,
  GroupRole.RECEPTION,
];

/** O papel pode ser destinatário de consentimento de leitura? */
export function canReceiveLink(role: GroupRole): boolean {
  return ROLES_ELIGIBLE_FOR_LINK.includes(role);
}

/** Papéis que se dão por convite, aprovação ou troca. Dono só por transferência. */
export const GRANTABLE_ROLES: readonly GroupRole[] = [
  GroupRole.MEMBER,
  GroupRole.PROFESSIONAL,
  GroupRole.CREATOR,
  GroupRole.ADMIN,
  GroupRole.RECEPTION,
];

/**
 * Que papéis este papel pode dar (#404): o dono, qualquer um; o administrador,
 * qualquer um menos o de administrador (ninguém promove alguém ao próprio nível);
 * o profissional (convite) e a recepção (aprovação no balcão), só o de membro.
 */
export function rolesGrantableBy(actor: GroupRole): readonly GroupRole[] {
  if (actor === GroupRole.OWNER) return GRANTABLE_ROLES;
  if (actor === GroupRole.ADMIN) return GRANTABLE_ROLES.filter((r) => r !== GroupRole.ADMIN);
  if (actor === GroupRole.PROFESSIONAL || actor === GroupRole.RECEPTION) return [GroupRole.MEMBER];
  return [];
}

/**
 * Quem pode mexer (papel, remover, banir) em quem tem `target` (#404). O dono
 * nunca: ele transfere. O administrador não mexe em outro administrador — nem
 * em si mesmo, o que impede o "me promovo" e o "me rebaixo e volto".
 */
export function canManageMember(actor: GroupRole, target: GroupRole): boolean {
  if (target === GroupRole.OWNER) return false;
  if (actor === GroupRole.OWNER) return true;
  if (actor === GroupRole.ADMIN) return target !== GroupRole.ADMIN;
  return false;
}

/** As especialidades do profissional (#404). */
export type Specialty = 'TRAINING' | 'NUTRITION' | 'PHYSIO' | 'OTHER';

/** O que um vínculo de nutricionista pode carregar (ADR 043 §1). */
const NUTRITION_SCOPES: readonly ShareScope[] = [
  ShareScope.NUTRITION,
  ShareScope.GOALS,
  ShareScope.BODY,
  ShareScope.MEAL_PHOTOS,
];

/**
 * As categorias que o vínculo de um profissional com esta especialidade pode
 * carregar. Só nutrição recorta; sem especialidade, nada muda.
 */
export function scopesForSpecialty(specialty: Specialty | null | undefined): readonly ShareScope[] {
  return specialty === 'NUTRITION' ? NUTRITION_SCOPES : Object.values(ShareScope);
}

/** Corta `scopes` pelo que a especialidade permite, na ordem de entrada. */
export function clipScopes(
  scopes: readonly ShareScope[],
  specialty: Specialty | null | undefined,
): ShareScope[] {
  const pode = scopesForSpecialty(specialty);
  return scopes.filter((s) => pode.includes(s));
}

/**
 * "Profissionais veem só quem acompanham" (#404): vale para o `PROFESSIONAL`,
 * não para o dono nem para o criador.
 */
export function seesOnlyAccompanied(role: GroupRole, proSeeOnlyAssigned: boolean): boolean {
  return proSeeOnlyAssigned && role === GroupRole.PROFESSIONAL;
}

/**
 * As linhas da tabela "O que cada papel pode fazer" (Pn-19). Uma linha vale
 * para o papel quando ele pode **todas** as ações dela; a de dado de aluno é a
 * do vínculo (`canReceiveLink`), porque papel nunca dá leitura. A tela e a API
 * leem daqui: uma fonte só.
 */
export const PERMISSION_SUMMARY: readonly {
  key: string;
  label: string;
  rule: 'actions' | 'link';
  actions: readonly GroupAction[];
}[] = [
  { key: 'student_data', label: 'Ver o que cada aluno compartilhou', rule: 'link', actions: [] },
  {
    key: 'follow',
    label: 'Ficha, Para revisar e Em risco',
    rule: 'actions',
    actions: ['member.file', 'panel.review'],
  },
  {
    key: 'plans',
    label: 'Enviar planos e anotar na ficha',
    rule: 'actions',
    actions: ['member.plans', 'member.note'],
  },
  {
    key: 'content',
    label: 'Publicar planos, dicas e exercícios',
    rule: 'actions',
    actions: ['content.publish'],
  },
  { key: 'posts', label: 'Postar no mural', rule: 'actions', actions: ['post.create'] },
  {
    key: 'announcements',
    label: 'Mandar comunicados',
    rule: 'actions',
    actions: ['announcement.publish'],
  },
  {
    key: 'moderation',
    label: 'Moderar o mural',
    rule: 'actions',
    actions: ['content.moderate', 'member.ban'],
  },
  {
    key: 'challenges',
    label: 'Criar desafios e revisar check-ins',
    rule: 'actions',
    actions: ['challenge.manage', 'challenge.review'],
  },
  { key: 'approve', label: 'Aprovar entradas', rule: 'actions', actions: ['member.approve'] },
  {
    key: 'invite',
    label: 'Convidar pessoas',
    rule: 'actions',
    actions: ['invite.create', 'invite.revoke'],
  },
  {
    key: 'team',
    label: 'Trocar papéis, remover e distribuir alunos',
    rule: 'actions',
    actions: ['member.role', 'member.remove', 'member.assign'],
  },
  { key: 'report', label: 'Relatório do mês', rule: 'actions', actions: ['insights.read'] },
  {
    key: 'settings',
    label: 'Configurações da comunidade',
    rule: 'actions',
    actions: ['group.update'],
  },
  {
    key: 'billing',
    label: 'Assentos e faturas',
    rule: 'actions',
    actions: ['billing.read', 'billing.manage'],
  },
  {
    key: 'ownership',
    label: 'Passar a posse e apagar a comunidade',
    rule: 'actions',
    actions: ['group.transfer', 'group.delete'],
  },
];

/** As colunas da tabela: a equipe, sem o membro. */
export const PERMISSION_COLUMNS: readonly GroupRole[] = STAFF_ROLES;

export interface PermissionTable {
  columns: GroupRole[];
  rows: { key: string; label: string; roles: GroupRole[] }[];
}

/** A tabela da Pn-19, calculada da matriz. */
export function permissionTable(): PermissionTable {
  return {
    columns: [...PERMISSION_COLUMNS],
    rows: PERMISSION_SUMMARY.map((l) => ({
      key: l.key,
      label: l.label,
      roles: PERMISSION_COLUMNS.filter((r) =>
        l.rule === 'link' ? canReceiveLink(r) : l.actions.every((a) => can(r, a)),
      ),
    })),
  };
}

/** As ações que o papel exerce, na ordem da matriz (o que a tela pode mostrar). */
export function actionsOf(role: GroupRole): GroupAction[] {
  return GROUP_ACTIONS.filter((a) => can(role, a));
}
