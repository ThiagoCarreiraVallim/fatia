'use client';

import { SHARE_SCOPE_LABEL, type ShareScope } from '@fatia/api-client';

const TODOS: ShareScope[] = ['WORKOUT', 'NUTRITION', 'BODY', 'HABITS', 'GOALS'];

/**
 * O que este aluno autorizou — e, com o mesmo peso visual, o que ele **não**
 * autorizou.
 *
 * Mostrar só o que foi consentido faria a ausência parecer inexistência: o
 * profissional veria "Treino" e concluiria que o aluno não registra alimentação,
 * quando o que houve foi uma escolha dele. As duas listas juntas são o que torna
 * o consentimento legível como decisão.
 */
export function ScopeChips({ granted }: { granted: ShareScope[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {TODOS.map((scope) => {
        const autorizado = granted.includes(scope);
        return (
          <li
            key={scope}
            className={
              autorizado
                ? 'rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary'
                : 'rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground line-through'
            }
          >
            {SHARE_SCOPE_LABEL[scope]}
            <span className="sr-only">
              {autorizado ? ' — autorizado por este aluno' : ' — não autorizado'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
