import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { msUntilNextDay } from '@fatia/api-client';
import { hojeIso } from '@/components/nutrition/helpers';

/**
 * O dia de hoje (AAAA-MM-DD, fuso do aparelho) que acompanha a virada: as abas
 * ficam montadas (Tabs), então um "hoje" calculado uma vez envelheceria. Muda
 * à meia-noite com o app aberto e ao voltar do segundo plano.
 */
export function useToday(): string {
  const [today, setToday] = useState(hojeIso);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setToday(hojeIso());
        arm();
      }, msUntilNextDay());
    };
    arm();
    // Com o app em segundo plano o timer atrasa ou nem dispara.
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      setToday(hojeIso());
      arm();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return today;
}

/** O resumo do dia (Hoje e Você): a data entra na chave, cada dia é um cache. */
export const dashboardTodayKey = (today: string) => ['dashboard', 'today', today] as const;

/**
 * Na virada do dia, tudo o que está em cache fica velho (o resumo, a semana do
 * treino, as metas): invalida, e as telas abertas buscam de novo.
 */
export function DayRolloverSync() {
  const qc = useQueryClient();
  const today = useToday();
  const visto = useRef(today);
  useEffect(() => {
    if (today === visto.current) return;
    visto.current = today;
    void qc.invalidateQueries();
  }, [today, qc]);
  return null;
}
