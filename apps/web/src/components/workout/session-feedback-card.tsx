import {
  reactionEmoji,
  sessionFeedbackByline,
  type WorkoutSessionFeedback,
} from '@fatia/api-client';

/**
 * A reação e o comentário da equipe num treino feito (#399), no histórico da
 * pessoa. Só leitura: a resposta vai pelo WhatsApp (ADR 048). Sem comentário,
 * não aparece.
 */
export function SessionFeedbackCard({ feedback }: { feedback?: WorkoutSessionFeedback[] }) {
  if (!feedback?.length) return null;
  return (
    <section aria-label="Da sua equipe" className="space-y-2.5 rounded-card bg-card px-4 py-3.5">
      <p className="text-xs font-extrabold tracking-[0.06em] text-muted-foreground">
        DA SUA EQUIPE
      </p>
      {feedback.map((f) => (
        <div key={f.id} className="flex gap-3">
          {f.reaction && <span className="text-2xl leading-none">{reactionEmoji(f.reaction)}</span>}
          <div className="min-w-0 flex-1 space-y-0.5">
            {f.body && <p className="text-sm">{f.body}</p>}
            <p className="text-xs text-faint">{sessionFeedbackByline(f)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
