import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  toggleScope,
  whoSees,
  type JoinConsent,
  type TeamMember,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/**
 * Réplica de `apps/web/src/components/community/consent-form.tsx`: o que a
 * equipe pode ver, nada marcado, opt-in das estatísticas à parte. Sem Switch
 * nem Checkbox no app, cada opção é um `Pressable` com papel de checkbox.
 */
function Opcao({
  label,
  detalhe,
  marcado,
  onToggle,
}: {
  label: string;
  detalhe: string;
  marcado: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado }}
      accessibilityLabel={label}
      accessibilityHint={detalhe}
      onPress={onToggle}
      className="min-h-[44px] flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center rounded border',
          marcado ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}
      >
        {marcado ? <Check size={14} color={cores.primaryForeground} /> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{detalhe}</Text>
      </View>
    </Pressable>
  );
}

const NADA: JoinConsent = { scopes: [], statsOptIn: false };

export function ConsentForm({
  initial = NADA,
  team,
  submitLabel,
  pending = false,
  error,
  onSubmit,
  secondary,
}: {
  initial?: JoinConsent;
  team: TeamMember[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (consent: JoinConsent) => void;
  secondary?: ReactNode;
}) {
  const [scopes, setScopes] = useState(initial.scopes);
  const [statsOptIn, setStatsOptIn] = useState(initial.statsOptIn);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          O que a equipe pode ver de você
        </Text>
        <Text className="text-xs text-muted-foreground">
          {`Quem vê: ${whoSees(team)}. Nada vem marcado, e você muda isso quando quiser.`}
        </Text>
        {SHARE_SCOPES.map((scope) => (
          <Opcao
            key={scope}
            label={SHARE_SCOPE_LABEL[scope]}
            detalhe={SCOPE_DETAILS[scope]}
            marcado={scopes.includes(scope)}
            onToggle={() => setScopes((atual) => toggleScope(atual, scope))}
          />
        ))}
      </View>

      <Opcao
        label="Entrar nas estatísticas da comunidade"
        detalhe="Só números agregados, sem seu nome; grupos com menos de 5 pessoas não aparecem."
        marcado={statsOptIn}
        onToggle={() => setStatsOptIn((v) => !v)}
      />

      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}

      <View className="gap-2">
        <Button size="lg" loading={pending} onPress={() => onSubmit({ scopes, statsOptIn })}>
          {submitLabel}
        </Button>
        {secondary}
      </View>
    </View>
  );
}
