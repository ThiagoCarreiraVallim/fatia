import type { GroupRole, TeamSpecialty } from './community';
import type { GrantableRole, StaffChange, StaffView } from './community-admin';

/**
 * Textos e regras da tela Equipe e permissões (Pn-19, #404), iguais na web e
 * no app. Quem decide o que cada papel pode é a API; aqui só se apresenta.
 */

export const TEAM_SPECIALTIES: readonly TeamSpecialty[] = [
  'TRAINING',
  'NUTRITION',
  'PHYSIO',
  'OTHER',
];

const SPECIALTY_LABEL: Record<TeamSpecialty, string> = {
  TRAINING: 'personal',
  NUTRITION: 'nutricionista',
  PHYSIO: 'fisioterapeuta',
  OTHER: 'outra',
};

export function specialtyLabel(s: TeamSpecialty | null | undefined): string {
  return s ? SPECIALTY_LABEL[s] : '—';
}

/** O que a especialidade muda no que o profissional recebe. */
export const SPECIALTY_NOTE =
  'Nutricionista recebe só Alimentação, Metas, Corpo e Fotos das refeições, mesmo que o aluno compartilhe mais.';

const STAFF_ROLE_WORD: Partial<Record<GroupRole, string>> = {
  OWNER: 'dono',
  ADMIN: 'admin',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador',
  RECEPTION: 'recepção',
};

export function staffRoleWord(role: GroupRole): string {
  return STAFF_ROLE_WORD[role] ?? 'membro';
}

/** As colunas da tabela "O que cada papel pode fazer". */
const COLUMN_LABEL: Partial<Record<GroupRole, string>> = {
  OWNER: 'Dono',
  ADMIN: 'Admin',
  PROFESSIONAL: 'Profissional',
  CREATOR: 'Criador',
  RECEPTION: 'Recepção',
};

export function permissionColumnLabel(role: GroupRole): string {
  return COLUMN_LABEL[role] ?? role;
}

/** Os papéis que a tela oferece para troca, na ordem da prancha. */
export const TEAM_ROLE_CHOICES: readonly GrantableRole[] = [
  'ADMIN',
  'PROFESSIONAL',
  'CREATOR',
  'RECEPTION',
];

/** A linha de baixo de cada pessoa: o que o papel faz, ou a especialidade e quantos acompanha. */
export function staffSubtitle(p: Pick<StaffView, 'role' | 'specialty' | 'accompanies'>): string {
  switch (p.role) {
    case 'OWNER':
      return 'tudo, inclusive faturas e apagar';
    case 'ADMIN':
      return 'cuida da comunidade · não vê dados de alunos nem faturas';
    case 'PROFESSIONAL': {
      const esp = p.specialty ? SPECIALTY_LABEL[p.specialty] : 'profissional';
      return `${esp} · acompanha ${p.accompanies ?? 0}`;
    }
    case 'CREATOR':
      return 'publica conteúdo';
    case 'RECEPTION':
      return 'nome, situação e entradas · não vê dados de alunos';
    default:
      return '';
  }
}

export interface StaffGroup {
  title: string;
  people: StaffView[];
}

const GROUPS: { title: string; roles: GroupRole[] }[] = [
  { title: 'Donos e administradores', roles: ['OWNER', 'ADMIN'] },
  { title: 'Profissionais e criadores', roles: ['PROFESSIONAL', 'CREATOR'] },
  { title: 'Recepção · não vê dados de alunos', roles: ['RECEPTION'] },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A equipe em grupos, filtrada pela busca (nome, papel ou especialidade). Grupo vazio some. */
export function staffGroups(staff: readonly StaffView[], query = ''): StaffGroup[] {
  const q = semAcento(query.trim());
  return GROUPS.map((g) => ({
    title: g.title,
    people: staff.filter(
      (p) =>
        g.roles.includes(p.role) &&
        (!q ||
          semAcento(`${p.name} ${staffRoleWord(p.role)} ${specialtyLabel(p.specialty)}`).includes(
            q,
          )),
    ),
  })).filter((g) => g.people.length > 0);
}

export const STAFF_SEARCH_EMPTY = 'Ninguém da equipe com esse nome.';
export const OWNER_ROLE_NOTE =
  'O dono não muda de papel aqui. Para passar adiante, use Configurações.';
export const TEAM_SHARING_NOTE =
  'O papel define o que cada pessoa faz; dados de aluno dependem sempre do que ele compartilhou.';

export function teamHeadline(n: number): string {
  return `${n} ${n === 1 ? 'pessoa' : 'pessoas'}. ${TEAM_SHARING_NOTE}`;
}

/** "último acesso hoje 09:12" a partir do carimbo do painel. */
export function staffLastAccessLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'ainda não abriu o painel';
  const d = new Date(iso);
  const min = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (min < 5) return 'último acesso agora';
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(now) - dia(d)) / 86400000);
  if (dias === 0) return `último acesso hoje ${hhmm}`;
  if (dias === 1) return 'último acesso ontem';
  if (dias < 7) return `último acesso há ${dias} dias`;
  return `último acesso em ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** O que muda na leitura de cada escolha do "Profissionais veem". */
export function proSeesNote(onlyAssigned: boolean): string {
  return onlyAssigned
    ? 'Cada profissional vê só os alunos que acompanha. Os outros, só se for posto como responsável.'
    : 'Qualquer profissional vê o que cada aluno compartilhou com a comunidade.';
}

export const PRO_SEES_CHOICES = [
  { value: true, label: 'Só quem acompanham' },
  { value: false, label: 'Todos que compartilham' },
] as const;

/** Uma linha do histórico da equipe, em português. */
export function staffChangeLine(c: StaffChange): string {
  const quem = c.actorName ?? 'Alguém';
  const alvo = c.targetName ?? (c.targetCount > 1 ? `${c.targetCount} pessoas` : 'uma pessoa');
  const papel = (r: string | null) => (r ? staffRoleWord(r as GroupRole) : '—');
  const esp = (s: string | null) => specialtyLabel(s as TeamSpecialty | null);
  switch (c.action) {
    case 'members.role':
      return `${quem} mudou ${alvo} de ${papel(c.from)} para ${papel(c.to)}`;
    case 'members.specialty':
      return `${quem} mudou a especialidade de ${alvo} de ${esp(c.from)} para ${esp(c.to)}`;
    case 'members.approve':
      return `${quem} aprovou ${alvo} como ${papel(c.to)}`;
    case 'members.accompany':
      return c.to
        ? `${quem} pôs ${c.to} como responsável de ${alvo}`
        : `${quem} tirou o responsável de ${alvo}`;
    case 'group.pro_see_only_assigned':
      return c.to === 'true'
        ? `${quem} fez profissionais verem só quem acompanham`
        : `${quem} fez profissionais verem todos que compartilham`;
    default:
      return `${quem} mudou a equipe`;
  }
}

/** A célula da tabela: ✓ pode, — não pode. */
export function permissionCell(role: GroupRole, roles: readonly GroupRole[]): string {
  return roles.includes(role) ? '✓' : '—';
}

/**
 * Os papéis que quem pergunta pode dar, iguais a `rolesGrantableBy` da API: o
 * dono dá todos; o admin, só membro e recepção; profissional e recepção, só
 * membro. A API confere de novo.
 */
export function grantableRolesFor(role: GroupRole): GrantableRole[] {
  if (role === 'OWNER') return ['MEMBER', ...TEAM_ROLE_CHOICES];
  // Profissional e criador recebem vínculo: só o dono dá (ADR 043).
  if (role === 'ADMIN') return ['MEMBER', 'RECEPTION'];
  if (role === 'PROFESSIONAL' || role === 'RECEPTION') return ['MEMBER'];
  return [];
}
