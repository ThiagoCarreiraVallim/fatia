import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/** Provisória: a tela das comunidades chega na Fase 5 (ADR 025/026). */
export default function CommunityPage() {
  return (
    <div className="space-y-6 px-4">
      <EmptyState
        icon={Users}
        title="Suas comunidades aparecem aqui"
        description="Entre pelo convite da sua academia ou do seu treinador e escolha o que compartilhar."
      />
    </div>
  );
}
