'use client';

import { useId } from 'react';
import { bestTextOn, checkBrandColor, formatRatio } from '@fatia/design';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { brandStyle } from '@/components/community/brand-cover';

/**
 * Campo da cor da comunidade no editor da marca. Mesma regra do app e da API
 * (`checkBrandColor` de @fatia/design): verde do Fatia é recusado; cor sem
 * contraste para texto passa com aviso e a sugestão do tom mais próximo que
 * passa ("Usar #6A4AE0"). A prévia mostra o botão e o selo como vão ficar.
 */
export function BrandColorField({
  value,
  onChange,
  label = 'Cor da comunidade',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const id = useId();
  const check = value ? checkBrandColor(value) : null;
  const rejected = check?.status === 'rejected' ? check.message : undefined;
  const pickerValue = check && check.status !== 'rejected' ? check.color : '#ff7a1a';

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="flex items-start gap-2">
        <input
          type="color"
          aria-label={`${label}: seletor`}
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-12 shrink-0 cursor-pointer rounded-field border-0 bg-transparent p-0"
        />
        <div className="flex-1">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="#FF7A1A"
            spellCheck={false}
            autoComplete="off"
            error={rejected}
          />
        </div>
      </div>

      {check?.status === 'warning' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-field bg-[hsl(var(--warning)/0.12)] p-4 text-warning"
        >
          <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-[13px] text-foreground">
            <p>{check.message}</p>
            <Button
              variant="secondary"
              size="xs"
              className="mt-2"
              onClick={() => onChange(check.suggestion)}
            >
              <span
                aria-hidden
                className="mr-1.5 inline-block h-3 w-3 rounded-full"
                style={{ background: check.suggestion }}
              />
              Usar {check.suggestion.toUpperCase()}
            </Button>
          </div>
        </div>
      )}

      {check && check.status !== 'rejected' && (
        // Com aviso, o texto da prévia vai sobre o tom sugerido: texto sobre a
        // cor sem contraste reprovaria no axe a própria tela que avisa dele. A
        // cor escolhida aparece como amostra, sem texto em cima.
        <div
          role="group"
          aria-label="Prévia"
          className="flex flex-col gap-2 rounded-card bg-card p-4"
        >
          <div
            style={brandStyle(check.status === 'warning' ? check.suggestion : check.color)}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="inline-flex h-11 items-center rounded-[12px] bg-brand px-[18px] text-sm font-bold text-brand-foreground">
              Entrar no desafio
            </span>
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-brand-foreground">
              PRO · Grupo
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatRatio(
                check.status === 'warning' ? bestTextOn(check.suggestion).contrast : check.contrast,
              )}
              :1
            </span>
          </div>
          {check.status === 'warning' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-4 w-4 shrink-0 rounded-full"
                style={{ background: check.color }}
              />
              Com o tom sugerido, {check.suggestion.toUpperCase()}. A sua cor,{' '}
              {check.color.toUpperCase()}, fica com {formatRatio(check.contrast)}:1.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
