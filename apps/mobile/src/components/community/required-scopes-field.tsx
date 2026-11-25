import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  REQUIRABLE_SCOPES,
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
  // Foto do prato nunca é obrigatória (#413). Só aparece se uma comunidade
  // antiga já a marcou, para poder desmarcar.
  const shown = SHARE_SCOPES.filter((s) => REQUIRABLE_SCOPES.includes(s) || value.includes(s));
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        O que os membros precisam compartilhar
      </Text>
      <Text className="text-xs text-muted-foreground">{hint}</Text>
      {shown.map((scope) => (
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
