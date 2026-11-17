/**
 * Ajuda e tutoriais dentro do app (Você › Ajuda, pranchas Al-V12/V12b, #387).
 *
 * O texto mora aqui, no pacote que vai junto do app e do PWA: sem internet, a
 * ajuda continua inteira (o aviso da V12b diz "os textos estão salvos"). Vídeo,
 * quando houver, é só online. O banco guarda só o que a pessoa já abriu
 * (`UserTutorialSeen`), pelo `id` — que é estável e nunca reaproveitado.
 *
 * Só entram tutoriais de funções que existem. O site de ajuda é a #415.
 */

export interface Tutorial {
  id: string;
  title: string;
  /** Parágrafos curtos, em texto puro. */
  body: string[];
  /** Vídeo hospedado (online). Nulo = só texto. */
  videoUrl: string | null;
  /** Duração do vídeo em segundos, para a linha "vídeo · 0:45". */
  videoSeconds: number | null;
}

export interface TutorialArea {
  title: string;
  items: Tutorial[];
}

export const TUTORIAL_AREAS: readonly TutorialArea[] = [
  {
    title: 'Nutrição',
    items: [
      {
        id: 'registrar-refeicao',
        title: 'Registrar uma refeição',
        body: [
          'Toque no botão verde da IA e escolha Refeição. Busque o alimento, ajuste a quantidade em gramas ou numa medida caseira e salve.',
          'Os alimentos que você usa aparecem primeiro na próxima vez. Tudo isso funciona sem o PRO.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
      {
        id: 'registrar-por-foto',
        title: 'Registrar por foto',
        body: [
          'No PRO, toque no botão verde da IA e em Foto do prato. A IA reconhece os itens e mostra uma revisão antes de salvar.',
          'Confira cada item e a quantidade. Se algo estiver errado, troque ou apague antes de confirmar.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
      {
        id: 'codigo-de-barras',
        title: 'Escanear o código de barras',
        body: [
          'Na busca de alimento, toque no leitor e aponte para o código do pacote. O produto vem com a tabela nutricional do rótulo.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
    ],
  },
  {
    title: 'Treino',
    items: [
      {
        id: 'registrar-series',
        title: 'Iniciar e registrar séries',
        body: [
          'Em Treino, escolha um plano ou comece um treino livre. Em cada exercício, anote carga e repetições e toque em concluir a série.',
          'O descanso começa sozinho. A última vez que você fez o exercício aparece ao lado, para comparar.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
      {
        id: 'unidades-de-carga',
        title: 'Ver a carga em libras',
        body: [
          'Em Você › Unidades, escolha lb para a carga e km, metros ou milhas para a distância. Muda só como você vê: o que já foi registrado não muda.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
    ],
  },
  {
    title: 'Comunidade',
    items: [
      {
        id: 'o-que-a-equipe-ve',
        title: 'O que a equipe vê de você',
        body: [
          'Ao entrar numa comunidade, você escolhe o que compartilhar com a equipe: treino, alimentação, peso, hábitos e metas. Cada um é separado e pode ser desligado depois.',
          'Os outros membros não veem seus números. No mural, eles veem seu apelido e, se você deixar, sua foto.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
    ],
  },
  {
    title: 'IA',
    items: [
      {
        id: 'conectar-sua-ia',
        title: 'Conectar ao Claude ou ChatGPT',
        body: [
          'Em Você › Conectar sua IA, copie o endereço do Fatia e adicione como conector no Claude ou no ChatGPT. Depois é só pedir: "registra meu almoço".',
          'Funciona no plano Free: a IA é sua, e o Fatia só guarda o que ela registrar.',
          'Se não funcionar: cole o endereço inteiro, com o botão copiar; entre com o mesmo e-mail da sua conta do Fatia; e, no ChatGPT, ative o conector na conversa antes de perguntar.',
          'Para desconectar, remova o conector no app da sua IA.',
        ],
        videoUrl: null,
        videoSeconds: null,
      },
    ],
  },
];

export const TUTORIALS: readonly Tutorial[] = TUTORIAL_AREAS.flatMap((a) => a.items);

/** O tutorial que o "Ver o tutorial" de Conectar sua IA abre (#388). */
export const CONNECT_AI_TUTORIAL_ID = 'conectar-sua-ia';

/** O tutorial pelo `id` (o `?tutorial=` da Ajuda), ou nada. */
export function tutorialById(id: string | null | undefined): Tutorial | null {
  return TUTORIALS.find((t) => t.id === id) ?? null;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * A linha de baixo de cada tutorial: "vídeo · 0:45" com internet; sem ela, o
 * vídeo some e fica "texto · vídeo indisponível" (V12b). Sem vídeo, "texto".
 */
export function tutorialSubtitle(t: Tutorial, online: boolean): string {
  if (!t.videoUrl) return 'texto';
  if (!online) return 'texto · vídeo indisponível';
  return t.videoSeconds ? `vídeo · ${clock(t.videoSeconds)}` : 'vídeo';
}

/** Busca da ajuda: título e texto, sem acento nem caixa. */
export function searchTutorials(query: string): TutorialArea[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return [...TUTORIAL_AREAS];
  return TUTORIAL_AREAS.map((a) => ({
    ...a,
    items: a.items.filter((t) => norm([t.title, ...t.body].join(' ')).includes(q)),
  })).filter((a) => a.items.length > 0);
}
