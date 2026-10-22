'use client';

import { useId, useState, type ReactNode } from 'react';
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
import { Button } from '@/components/ui/button';

interface Props {
  /** O que a pessoa já escolheu. Ao entrar, só o obrigatório vem marcado (ADR 026). */
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
  /** O que a comunidade exige de quem entra como membro (`requiredSharingScopes`). */
  required?: readonly ShareScope[];
}

const NOTHING_SHARED: JoinConsent = { scopes: [], statsOptIn: false };

/**
 * Uma opção do consentimento: checkbox com rótulo e explicação.
 *
 * `locked` é o escopo que a comunidade exige: vem marcado, não desmarca e diz
 * por quê, no rótulo visível e na descrição que o leitor de tela anuncia. A API
 * recusa do mesmo jeito; travar aqui só poupa o erro.
 */
export function ScopeOption({
  id,
  label,
  detail,
  checked,
  onToggle,
  locked = false,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
  locked?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 items-start gap-3 rounded-xl border border-subtle bg-card p-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={locked}
        aria-describedby={locked ? `${id}-required` : undefined}
        onChange={() => {
          if (!locked) onToggle();
        }}
        className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-60"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
        {locked && (
          <span id={`${id}-required`} className="block text-xs font-semibold text-primary">
            {REQUIRED_SCOPE_NOTE}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * A escolha do que compartilhar com a equipe de uma comunidade: ao aceitar o
 * convite, ao entrar pelo código e depois, na própria comunidade. Recusar tudo
 * é uma resposta válida — a pessoa entra do mesmo jeito —, menos o que a
 * comunidade exige (ADR 026), que vem marcado e travado.
 */
export function ConsentForm({
  initial = NOTHING_SHARED,
  team,
  submitLabel,
  pending = false,
  error,
  onSubmit,
  secondary,
  editing = false,
  required = [],
}: Props) {
  const id = useId();
  // Entrando, os obrigatórios já vêm marcados; editando, vale o que está gravado.
  const [scopes, setScopes] = useState(() =>
    editing
      ? initial.scopes
      : SHARE_SCOPES.filter((s) => initial.scopes.includes(s) || required.includes(s)),
  );
  const [statsOptIn, setStatsOptIn] = useState(initial.statsOptIn);
  // Sobre o que estava gravado, e não sobre o estado: trava o que a pessoa já
  // compartilha (ou passa a compartilhar ao entrar). Quem entrou antes da
  // exigência não deve o que nunca deu.
  const locked = lockedScopes(required, editing ? initial.scopes : required);

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
            : locked.length > 0
              ? `Quem vê: ${whoSees(team)}. O que a comunidade exige vem marcado; o resto é com você, e muda quando quiser.`
              : `Quem vê: ${whoSees(team)}. Nada vem marcado, e você muda isso quando quiser.`}
        </p>
        {editing && locked.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Para parar de compartilhar o que é obrigatório, é preciso sair da comunidade.
          </p>
        )}
        <ul className="space-y-2">
          {SHARE_SCOPES.map((scope) => (
            <li key={scope}>
              <ScopeOption
                id={`${id}-${scope}`}
                label={SHARE_SCOPE_LABEL[scope]}
                detail={SCOPE_DETAILS[scope]}
                checked={scopes.includes(scope)}
                locked={locked.includes(scope)}
                onToggle={() => setScopes((current) => toggleScope(current, scope))}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <ScopeOption
        id={`${id}-stats`}
        label="Entrar nas estatísticas da comunidade"
        detail="Só números agregados, sem seu nome; grupos com menos de 5 pessoas não aparecem."
        checked={statsOptIn}
        onToggle={() => setStatsOptIn((v) => !v)}
      />

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
