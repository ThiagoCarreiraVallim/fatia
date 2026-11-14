import { Text, View } from 'react-native';
import { THEME_PREFERENCE_LABELS, THEME_PREFERENCES, type ThemePreference } from '@fatia/design';
import { Screen } from '@/components/layout/screen';
import { Segmented } from '@/components/ui/selection';
import { useTheme } from '@/theme/theme-provider';

/**
 * Perfil → Aparência (ADR 041), igual à da web. Sistema (padrão), Escuro ou
 * Claro; a escolha fica neste celular e vale na hora.
 */
export default function AppearanceScreen() {
  const { preference, theme, setPreference } = useTheme();
  const now = theme === 'dark' ? 'escuro' : 'claro';
  return (
    <Screen>
      <View className="gap-4 p-4">
        <Segmented<ThemePreference>
          label="Tema"
          value={preference}
          onChange={setPreference}
          options={THEME_PREFERENCES.map((p) => ({ value: p, label: THEME_PREFERENCE_LABELS[p] }))}
        />
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {preference === 'system'
            ? `Seguindo o sistema: agora está ${now}.`
            : `Sempre ${now}, mesmo que o sistema mude.`}
        </Text>
      </View>
    </Screen>
  );
}
