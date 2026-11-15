/**
 * Contratos dos cartões do Hoje (Al-H1-Hoje, #373) cujos dados nascem em outras
 * issues da história #367. O `GET /dashboard/today` já devolve os campos — vazios
 * ou nulos —, e app e web já sabem desenhá-los: quem implementar a origem só
 * preenche, sem mexer na tela. Espelhados em `packages/api-client/src/progress.ts`.
 */

/** De onde vem um item do "Para fazer". Cada issue acrescenta o seu. */
export type TodoKind = 'assessment' | 'plan_offer' | 'questionnaire';

/** Um pedido da equipe para a pessoa ("Avaliação física de novembro"). */
export interface TodoItem {
  kind: TodoKind;
  /** Id da coisa pedida no domínio dela (avaliação, oferta, questionário). */
  id: string;
  title: string;
  /** "pedida pela Helena · até 15 nov". */
  subtitle: string;
  /** Caminho da tela que resolve o pedido, igual no app e na web. */
  href: string;
}

export interface TodoSummary {
  count: number;
  /** Os primeiros itens, na ordem em que a tela mostra. */
  items: TodoItem[];
}

/** "Novo treino da Helena": plano enviado pela equipe e ainda não aberto (#379). */
export interface ReceivedPlan {
  id: string;
  title: string;
  /** "Inferior v2 · 4 semanas". */
  subtitle: string;
  /** Nome de quem enviou, para as iniciais do avatar. */
  fromName: string;
  href: string;
}

/** Evento da agenda da comunidade de hoje (#397): "Vou" antes, "Foi?" depois. */
export interface NextEvent {
  id: string;
  title: string;
  startsAt: string;
  /** "Sala 2 · com Helena · lembrete às 18h". */
  subtitle: string;
  /** A pessoa marcou "Vou". */
  going: boolean;
  /** Já passou: o cartão pergunta "Foi?" e oferece registrar a aula. */
  past: boolean;
  /** Duração da aula, para "Registrar a aula · 60 min". */
  durationMin: number | null;
  href: string;
}
