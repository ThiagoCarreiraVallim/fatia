import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  lockedScopes,
  REQUIRED_SCOPE_NOTE,
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  toggleScope,
  whoSees,
  type JoinConsent,
  type ShareScope,
  type TeamMember,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/**
 * Réplica de `apps/web/src/components/community/consent-form.tsx`: o que a
 * equipe pode ver, nada marcado, opt-in das estatísticas à parte. Sem Switch
 * nem Checkbox no app, cada opção é um `Pressable` com papel de checkbox.
 *
 * `locked` é o escopo que a comunidade exige: aparece marcado, não desmarca e
 * diz por quê. A API recusa do mesmo jeito; travar aqui só poupa o erro.
 */
export function ScopeOption({
  label,
  detail,
  checked,
  onToggle,
  locked = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
  locked?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      accessibilityLabel={label}
      accessibilityHint={locked ? `${detail}. ${REQUIRED_SCOPE_NOTE}.` : detail}
      disabled={locked}
      onPress={onToggle}
      className="min-h-[44px] flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary' : 'border-muted-foreground',
          locked && 'opacity-60',
        )}
      >
        {checked ? <Check size={14} color={cores.primaryForeground} /> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
        {locked ? (
          <Text className="text-xs font-semibold text-primary">{REQUIRED_SCOPE_NOTE}</Text>
        ) : null}
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
  editing = false,
  required = [],
}: {
  initial?: JoinConsent;
  team: TeamMember[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (consent: JoinConsent) => void;
  secondary?: ReactNode;
  /** Editando na tela da comunidade, que tem o próprio título: sem o título e o texto da entrada. */
  editing?: boolean;
  /** O que a comunidade exige de quem entra como membro (`requiredSharingScopes`). */
  required?: readonly ShareScope[];
}) {
  // Entrando, os obrigatórios já vêm marcados; editando, vale o que está gravado.
  const [scopes, setScopes] = useState(() =>
    editing
      ? initial.scopes
      : SHARE_SCOPES.filter((s) => initial.scopes.includes(s) || required.includes(s)),
  );
  const [statsOptIn, setStatsOptIn] = useState(initial.statsOptIn);
  // Calculado sobre o que estava gravado, e não sobre o estado: o que trava é o
  // que a pessoa já compartilha (ou passa a compartilhar ao entrar).
  const travados = lockedScopes(required, editing ? initial.scopes : required);

  return (
    <View className="gap-4">
      <View className="gap-2">
        {editing ? null : (
          <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
            O que a equipe pode ver de você
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          {editing
            ? `Quem vê: ${whoSees(team)}. Desmarcar tira o acesso a partir da próxima consulta.`
            : travados.length > 0
              ? `Quem vê: ${whoSees(team)}. O que a comunidade exige vem marcado; o resto é com você, e muda quando quiser.`
              : `Quem vê: ${whoSees(team)}. Nada vem marcado, e você muda isso quando quiser.`}
        </Text>
        {editing && travados.length > 0 ? (
          <Text className="text-xs text-muted-foreground">
            Para parar de compartilhar o que é obrigatório, é preciso sair da comunidade.
          </Text>
        ) : null}
        {SHARE_SCOPES.map((scope) => (
          <ScopeOption
            key={scope}
            label={SHARE_SCOPE_LABEL[scope]}
            detail={SCOPE_DETAILS[scope]}
            checked={scopes.includes(scope)}
            locked={travados.includes(scope)}
            onToggle={() => setScopes((atual) => toggleScope(atual, scope))}
          />
        ))}
      </View>

      <ScopeOption
        label="Entrar nas estatísticas da comunidade"
        detail="Só números agregados, sem seu nome; grupos com menos de 5 pessoas não aparecem."
        checked={statsOptIn}
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
