'use client';

import { useId } from 'react';
import {
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  toggleScope,
  type ShareScope,
} from '@fatia/api-client';
import { ScopeOption } from './consent-form';

/**
 * O que o dono exige que membros compartilhem para participar (ADR 026). Os
 * mesmos toggles da tela de consentimento, do outro lado: aqui se marca o que
 * vem travado para quem entra.
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
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">O que os membros precisam compartilhar</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-2">
        {SHARE_SCOPES.map((scope) => (
          <li key={scope}>
            <ScopeOption
              id={`${id}-${scope}`}
              label={SHARE_SCOPE_LABEL[scope]}
              detail={SCOPE_DETAILS[scope]}
              checked={value.includes(scope)}
              onToggle={() => onChange(toggleScope(value, scope))}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
