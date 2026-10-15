import { View } from 'react-native';
import { Screen } from '@/components/layout/screen';
import { EmptyState } from '@/components/ui';

/** Provisória: as comunidades chegam na Fase 5 (ADR 025/026), como no PWA. */
export default function CommunityScreen() {
  return (
    <Screen>
      <View className="px-5 pt-4">
        <EmptyState
          title="Suas comunidades aparecem aqui"
          description="Entre pelo convite da sua academia ou do seu treinador e escolha o que compartilhar."
        />
      </View>
    </Screen>
  );
}
