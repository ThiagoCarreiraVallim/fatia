'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayLabel, shiftDay } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Dia de um registro novo de água, peso ou passos.
 *
 * Setas para o caso comum (esqueceu ontem, a um toque) e o calendário nativo
 * para o salto longo. O futuro fica travado aqui e na API: meta de um dia que
 * nem começou não existe.
 */
export function LogDayField({
  id,
  day,
  today,
  onChange,
}: {
  id: string;
  day: string;
  today: string;
  onChange: (day: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          Dia
        </label>
        {/* O formato do calendário nativo segue o idioma do navegador (10/14 num
            Chrome em inglês); o rótulo por extenso tira a dúvida. */}
        <span id={`${id}-label`} className="text-sm capitalize text-muted-foreground">
          {dayLabel(day, today)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dia anterior"
          onClick={() => onChange(shiftDay(day, -1))}
        >
          <ChevronLeft size={18} aria-hidden />
        </Button>
        <Input
          id={id}
          type="date"
          max={today}
          aria-describedby={`${id}-label`}
          value={day}
          // Vazio (o "limpar" do calendário) não é dia: fica o anterior. Dia
          // digitado no futuro vira hoje em vez de falhar só ao salvar.
          onChange={(e) => {
            const next = e.target.value;
            if (next) onChange(next > today ? today : next);
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Próximo dia"
          disabled={day >= today}
          onClick={() => onChange(shiftDay(day, 1))}
        >
          <ChevronRight size={18} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
