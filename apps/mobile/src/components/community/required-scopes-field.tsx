import { Text, View } from 'react-native';
import {
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  toggleScope,
  type ShareScope,
} from '@fatia/api-client';
import { ScopeOption } from './consent-form';

/**
 * O que o dono exige que membros compartilhem para participar. Os mesmos
 * toggles da tela de consentimento, do outro lado: aqui se marca o que vem
 * travado para quem entra.
 */
export function RequiredScopesField({
  value,
  onChange,
  hint,
}: {
  value: ShareScope[];
  onChange: (next: ShareScope[]) => void;
  hint: string;
}) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        O que os membros precisam compartilhar
      </Text>
      <Text className="text-xs text-muted-foreground">{hint}</Text>
      {SHARE_SCOPES.map((scope) => (
        <ScopeOption
          key={scope}
          label={SHARE_SCOPE_LABEL[scope]}
          detail={SCOPE_DETAILS[scope]}
          checked={value.includes(scope)}
          onToggle={() => onChange(toggleScope(value, scope))}
        />
      ))}
    </View>
  );
}
