'use client';

import { THEME_PREFERENCE_LABELS, THEME_PREFERENCES, type ThemePreference } from '@fatia/design';
import { Segmented } from '@/components/ui/selection';
import { useThemePreference } from '@/lib/theme-preference';

/**
 * Perfil → Aparência (ADR 041). Sistema (padrão), Escuro ou Claro; a escolha
 * fica neste navegador e vale na hora, sem recarregar. "Sistema" acompanha o
 * celular ou o computador quando ele troca sozinho à noite.
 */
export default function AppearancePage() {
  const { preference, theme, setPreference } = useThemePreference();
  return (
    <div className="space-y-4 px-5 pt-4 pb-8">
      <Segmented<ThemePreference>
        label="Tema"
        value={preference}
        onChange={setPreference}
        options={THEME_PREFERENCES.map((p) => ({ value: p, label: THEME_PREFERENCE_LABELS[p] }))}
      />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {preference === 'system'
          ? `Seguindo o sistema: agora está ${theme === 'dark' ? 'escuro' : 'claro'}.`
          : `Sempre ${theme === 'dark' ? 'escuro' : 'claro'}, mesmo que o sistema mude.`}
      </p>
    </div>
  );
}
