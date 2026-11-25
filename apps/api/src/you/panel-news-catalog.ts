/**
 * As novidades do painel da equipe (#413, Pn-27). Mesmo desenho das novidades
 * do aluno (#387, `news-catalog.ts`): vivem em código, entram no mesmo deploy da
 * função que anunciam, e o banco guarda só o que a pessoa leu (`UserNewsRead`).
 *
 * Os ids começam com `painel-` e nunca colidem com os do aluno: os dois
 * catálogos dividem a mesma tabela de lidas. Estável e nunca reaproveitado.
 * Mais nova primeiro. Só entra o que já está no ar.
 */
export interface PanelNewsEntry {
  id: `painel-${string}`;
  /** AAAA-MM-DD. */
  date: string;
  title: string;
  body: string;
  /** Nome do ícone do design system (`@fatia/design`). */
  icon: string;
  /** A seção do painel que a novidade abre (`PanelSection` do cliente). Nula = nenhuma. */
  section: string | null;
}

export const PANEL_NEWS: readonly PanelNewsEntry[] = [
  {
    id: 'painel-integracoes',
    date: '2026-11-23',
    title: 'Integrações e API',
    body: 'Crie uma chave e ligue o Fatia ao Zapier ou ao Make. A cota do mês aparece na mesma tela.',
    icon: 'link',
    section: 'integrations',
  },
  {
    id: 'painel-marca-e-secoes',
    date: '2026-11-23',
    title: 'Cor, capa e seções',
    body: 'Em Configurações: a cor e a capa da comunidade, e as seções que os membros veem.',
    icon: 'palette',
    section: 'settings',
  },
  {
    id: 'painel-boas-vindas',
    date: '2026-11-21',
    title: 'Páginas de boas-vindas',
    body: 'Até 3 páginas que o membro vê ao entrar, com prévia no celular.',
    icon: 'home',
    section: 'welcome',
  },
  {
    id: 'painel-catalogo-exercicios',
    date: '2026-11-20',
    title: 'Catálogo de exercícios da casa',
    body: 'Escreva o jeito da academia de fazer cada exercício: passos, erros comuns e o padrão ao entrar num plano.',
    icon: 'dumbbell',
    section: 'exercises',
  },
  {
    id: 'painel-editor-alimentacao',
    date: '2026-11-20',
    title: 'Editor de alimentação',
    body: 'Monte o plano por refeição, com opções e totais do dia, e envie uma versão nova sem perder o que o aluno registrou.',
    icon: 'apple',
    section: 'content',
  },
  {
    id: 'painel-editor-treino',
    date: '2026-11-20',
    title: 'Editor de plano de treino',
    body: 'Sessões, séries, carga em % e cardio num editor só, com o que mudou em cada versão.',
    icon: 'edit',
    section: 'content',
  },
  {
    id: 'painel-enviar-alunos',
    date: '2026-11-20',
    title: 'Enviar para alunos',
    body: 'Escolha o plano, para quem e quando começa. O aluno aceita no app.',
    icon: 'send',
    section: 'send',
  },
  {
    id: 'painel-equipe',
    date: '2026-11-20',
    title: 'Equipe e permissões',
    body: 'Papéis de dono, admin, profissional e recepção, com o que cada um pode fazer.',
    icon: 'users',
    section: 'team',
  },
];

export const PANEL_NEWS_IDS: ReadonlySet<string> = new Set(PANEL_NEWS.map((n) => n.id));
