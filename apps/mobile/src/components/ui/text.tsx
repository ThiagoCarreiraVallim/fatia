import { createContext, useContext, type ComponentProps } from 'react';
import { Text as NativeText } from 'react-native';
import { cn } from './utils';

/**
 * `Text` do design system: Manrope por padrão.
 *
 * No Android, texto sem `fontFamily` sai em Roboto — e o app quase todo é
 * `Text` sem família. Este componente põe `font-sans` antes da classe de quem
 * chama; `font-bold`, `font-display` e afins continuam vencendo (ver
 * `tailwind.config.js`). O `Text` do react-native não deve ser importado fora
 * daqui (`font-usage.test.ts`).
 *
 * Cor: o `Text` do React Native sem cor sai **preto**, ilegível no tema
 * escuro. Por isso o texto de fora já nasce `text-foreground`; qualquer classe
 * de cor de quem chama (`text-muted-foreground`, `text-primary-foreground`…)
 * ou `style.color` vence.
 *
 * Texto aninhado herda o estilo do pai no React Native; por isso o filho não
 * repõe `font-sans` nem a cor, senão um trecho dentro de um título em negrito
 * voltaria ao regular, ou um trecho dentro de um texto verde ficaria branco.
 */
const InsideText = createContext(false);

export type TextProps = ComponentProps<typeof NativeText> & { className?: string };

export function Text({ className, ...props }: TextProps) {
  const nested = useContext(InsideText);
  return (
    <InsideText.Provider value>
      <NativeText
        className={nested ? className : cn('font-sans text-foreground', className)}
        {...props}
      />
    </InsideText.Provider>
  );
}
