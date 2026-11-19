import { View } from 'react-native';
import {
  reactionEmoji,
  sessionFeedbackByline,
  type WorkoutSessionFeedback,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';

/**
 * Réplica de `apps/web/src/components/workout/session-feedback-card.tsx`: a
 * reação e o comentário da equipe num treino feito (#399). Só leitura: a
 * resposta vai pelo WhatsApp (ADR 048). Sem comentário, não aparece.
 */
export function SessionFeedbackCard({ feedback }: { feedback?: WorkoutSessionFeedback[] }) {
  if (!feedback?.length) return null;
  return (
    <View accessibilityLabel="Da sua equipe" className="gap-2.5 rounded-card bg-card px-4 py-3.5">
      <Text className="font-sans-bold text-xs tracking-[0.06em] text-muted-foreground">
        DA SUA EQUIPE
      </Text>
      {feedback.map((f) => (
        <View key={f.id} className="flex-row gap-3">
          {f.reaction ? <Text className="text-2xl">{reactionEmoji(f.reaction)}</Text> : null}
          <View className="min-w-0 flex-1 gap-0.5">
            {f.body ? <Text className="text-sm text-foreground">{f.body}</Text> : null}
            <Text className="text-xs text-faint">{sessionFeedbackByline(f)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
