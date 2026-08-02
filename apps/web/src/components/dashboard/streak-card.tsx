import { Flame, Lock, Trophy } from 'lucide-react';
import {
  legendaDeTolerancia,
  rotuloDeSequencia,
  type Achievement,
  type TodaySummary,
} from '@fatia/api-client';

interface Props {
  streak: TodaySummary['streak'];
  achievements: Achievement[];
}

/**
 * Sequência e conquistas (issue #147).
 *
 * O número grande é o de **dias ativos** — refeição OU treino OU meta de passos —, e não o de
 * nutrição. Somar só refeição empurraria a pessoa a registrar qualquer coisa para não perder a
 * sequência, que é o risco de produto que a própria issue levanta.
 *
 * A legenda da tolerância vem do `@fatia/api-client` para que o app nativo diga a mesma frase.
 */
export function StreakCard({ streak, achievements }: Props) {
  const legenda = legendaDeTolerancia(streak.activeDays, 'dias');
  const desbloqueadas = achievements.filter((a) => a.unlockedAt !== null);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Sequência</h2>
        <span className="text-xs text-muted-foreground">
          {desbloqueadas.length}/{achievements.length} conquistas
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Flame size={28} className="text-orange-500" aria-hidden />
        <span className="text-3xl font-semibold tabular-nums">
          {rotuloDeSequencia(streak.activeDays, 'dias')}
        </span>
      </div>

      {legenda && <p className="text-xs text-muted-foreground">{legenda}</p>}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Detalhe termo="Nutrição" valor={rotuloDeSequencia(streak.nutritionDays, 'dias')} />
        {/* Treino é semanal; os outros dois são diários. Misturar as unidades num número só
            faria "5" significar coisas diferentes na mesma linha. */}
        <Detalhe termo="Treino" valor={rotuloDeSequencia(streak.workoutWeeks, 'semanas')} />
        <Detalhe
          termo="Passos"
          valor={streak.stepsTargetSet ? rotuloDeSequencia(streak.stepsDays, 'dias') : 'sem meta'}
        />
      </dl>

      {achievements.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {achievements.map((a) => {
            const aberta = a.unlockedAt !== null;
            return (
              <li
                key={a.key}
                title={a.description}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                  aberta ? 'border-amber-500/40 text-foreground' : 'text-muted-foreground'
                }`}
              >
                {aberta ? (
                  <Trophy size={12} className="text-amber-500" aria-hidden />
                ) : (
                  <Lock size={12} aria-hidden />
                )}
                <span>{a.title}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Detalhe({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{termo}</dt>
      <dd className="text-sm font-medium tabular-nums">{valor}</dd>
    </div>
  );
}
