import type { ReviewKind, SessionReaction, ShareScope, WorkoutCheckin } from '@fatia/db';
import type { SessionSummaryView } from '../workout/workout-session.service';

/** Uma linha de "Para revisar" (#399, Pn-02). */
export interface ReviewItem {
  kind: ReviewKind;
  /** Sessão, meta ou versão da oferta. */
  refId: string;
  membershipId: string;
  name: string;
  /** Quando aconteceu: o fim do treino, a meta concluída ou a resposta. */
  at: Date;
  /** Nome do plano (nulo no treino livre), da meta ou do plano mandado. */
  title: string | null;
  durationMinutes: number | null;
  sets: number | null;
  /** Só na resposta ao plano. */
  answer: 'ACCEPTED' | 'DECLINED' | null;
  /** O que a pessoa libera para quem olha (coluna "Compartilha"). */
  shares: ShareScope[];
  /** O WhatsApp que a pessoa deixou a equipe ver; nulo sem permissão. */
  whatsapp: string | null;
  /** Quando QUEM OLHA marcou "Visto". Nulo = na aba "Para revisar". */
  seenAt: Date | null;
  /** Quem olha já reagiu ou comentou (só treino). */
  myFeedback: boolean;
}

export interface ReviewQueue {
  windowDays: number;
  items: ReviewItem[];
}

/** "Em risco" (#399): por que a pessoa está na lista. */
export type RiskSignal = 'inactive' | 'never' | 'no_workout';

export interface AtRiskRow {
  membershipId: string;
  name: string;
  signal: RiskSignal;
  /** `gone` a partir do dobro do limite ("sumiu"). */
  level: 'attention' | 'gone';
  /** Dias desde o último registro (ou treino, ou a entrada, conforme o sinal). */
  days: number;
  lastAt: Date | null;
  shares: ShareScope[];
  whatsapp: string | null;
}

export interface AtRiskView {
  riskDays: number;
  /** O aviso diário de quem olha está ligado. */
  digest: boolean;
  /** Quem olha muda o limite (o dono). */
  canConfigure: boolean;
  rows: AtRiskRow[];
}

export interface ReviewFeedback {
  id: string;
  authorName: string | null;
  reaction: SessionReaction | null;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  isMine: boolean;
}

type SessionDetail = Omit<SessionSummaryView, 'checkin' | 'questions' | 'savedPlanId' | 'feedback'>;

/** A sessão feita no painel: o detalhe (Pn-35) ou só o aviso (Pn-35b). */
export type ReviewSessionView =
  | {
      shared: true;
      membershipId: string;
      name: string;
      whatsapp: string | null;
      summary: SessionDetail;
      checkin: Omit<WorkoutCheckin, 'userId'> | null;
      feedback: ReviewFeedback[];
      seenAt: Date | null;
    }
  | { shared: false; name: string };
