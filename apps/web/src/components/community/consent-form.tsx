'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  toggleScope,
  whoSees,
  type JoinConsent,
  type TeamMember,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';

interface Props {
  /** O que a pessoa já escolheu. Ao entrar, nada vem marcado (ADR 026). */
  initial?: JoinConsent;
  team: TeamMember[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (consent: JoinConsent) => void;
  /** Ação ao lado do botão principal (ex.: "Agora não"). */
  secondary?: ReactNode;
  /**
   * Editando o que já compartilha (a tela da comunidade, que tem o próprio título):
   * a legenda fica só para leitor de tela e some o "nada vem marcado" da entrada.
   */
  editing?: boolean;
}

const NADA: JoinConsent = { scopes: [], statsOptIn: false };

/**
 * A escolha do que compartilhar com a equipe de uma comunidade: ao aceitar o
 * convite, ao entrar pelo código e depois, na própria comunidade. Recusar tudo
 * é uma resposta válida — a pessoa entra do mesmo jeito.
 */
export function ConsentForm({
  initial = NADA,
  team,
  submitLabel,
  pending = false,
  error,
  onSubmit,
  secondary,
  editing = false,
}: Props) {
  const id = useId();
  const [scopes, setScopes] = useState(initial.scopes);
  const [statsOptIn, setStatsOptIn] = useState(initial.statsOptIn);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ scopes, statsOptIn });
      }}
    >
      <fieldset className="space-y-3">
        <legend className={editing ? 'sr-only' : 'text-sm font-semibold text-foreground'}>
          O que a equipe pode ver de você
        </legend>
        <p className="text-xs text-muted-foreground">
          {editing
            ? `Quem vê: ${whoSees(team)}. Desmarcar tira o acesso a partir da próxima consulta.`
            : `Quem vê: ${whoSees(team)}. Nada vem marcado, e você muda isso quando quiser.`}
        </p>
        <ul className="space-y-2">
          {SHARE_SCOPES.map((scope) => (
            <li key={scope}>
              <label
                htmlFor={`${id}-${scope}`}
                className="flex min-h-11 items-start gap-3 rounded-xl border border-subtle bg-card p-3"
              >
                <input
                  id={`${id}-${scope}`}
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => setScopes((atual) => toggleScope(atual, scope))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{SHARE_SCOPE_LABEL[scope]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {SCOPE_DETAILS[scope]}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label
        htmlFor={`${id}-stats`}
        className="flex min-h-11 items-start gap-3 rounded-xl border border-subtle bg-card p-3"
      >
        <input
          id={`${id}-stats`}
          type="checkbox"
          checked={statsOptIn}
          onChange={(e) => setStatsOptIn(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">Entrar nas estatísticas da comunidade</span>
          <span className="block text-xs text-muted-foreground">
            Só números agregados, sem seu nome; grupos com menos de 5 pessoas não aparecem.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
