'use client';

import { useId } from 'react';
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
  // Foto do prato nunca é obrigatória (#413). Só aparece se uma comunidade
  // antiga já a marcou, para poder desmarcar.
  const shown = SHARE_SCOPES.filter((s) => REQUIRABLE_SCOPES.includes(s) || value.includes(s));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">O que os membros precisam compartilhar</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-2">
        {shown.map((scope) => (
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
