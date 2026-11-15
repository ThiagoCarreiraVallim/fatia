'use client';

import { useEffect, useRef } from 'react';
import { figureTone } from '@fatia/api-client';
import { describeMuscles } from './muscle-labels';

/** Os cinzas fixos do desenho, como estão escritos nos dois SVGs. */
const FIGURE_FILLS = ['#F5F5F5', '#BDBDBD', '#AEAEB2', '#E0E0E0'];

/**
 * Troca os cinzas de tema claro do SVG pelos tokens do tema (`figureTone`):
 * sem isso o boneco é uma caixa `#F5F5F5` no card escuro. O SVG é outro
 * documento, então os tokens são lidos aqui e entram prontos numa folha de
 * estilo dele; a pintura dos grupos é estilo inline e continua vencendo.
 */
function themeFigure(doc: Document) {
  const root = getComputedStyle(document.documentElement);
  const css = (tone: string) =>
    tone === 'transparent' ? 'transparent' : `hsl(${root.getPropertyValue(`--${tone}`).trim()})`;
  const rules = FIGURE_FILLS.map((fill) => {
    const tone = figureTone(fill);
    return tone ? `[fill="${fill}"]{fill:${css(tone)}}` : '';
  });
  rules.push(`[stroke="black"]{stroke:${css(figureTone('black') ?? 'card')}}`);
  let style: Element | null = doc.getElementById('fatia-tema');
  if (!style) {
    style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.id = 'fatia-tema';
    doc.documentElement.appendChild(style);
  }
  style.textContent = rules.join('');
}

interface MuscleDiagramProps {
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  view?: 'front' | 'back' | 'both';
  /**
   * Cor por músculo (chave `data-muscle` → cor CSS pronta, `hsl(var(--x))`).
   * Quando vem, vence primário/secundário: é o "Seus músculos hoje" (#377)
   * pintando cada grupo pelo descanso. O que não está no mapa fica esmaecido.
   */
  colors?: Record<string, string>;
  /** Rótulo do desenho para leitor de tela; sem ele, descreve os músculos. */
  label?: string;
  /** Largura de cada vista, em classe Tailwind (padrão `w-32`). */
  sizeClassName?: string;
}

export function MuscleDiagram({
  primaryMuscles = [],
  secondaryMuscles = [],
  view = 'both',
  colors,
  label,
  sizeClassName = 'w-32',
}: MuscleDiagramProps) {
  const frontRef = useRef<HTMLObjectElement>(null);
  const backRef = useRef<HTMLObjectElement>(null);

  useEffect(() => {
    const highlight = (obj: HTMLObjectElement | null) => {
      if (!obj) return;
      const doc = obj.contentDocument;
      if (!doc) return;

      // Os paths do SVG têm fill próprio (presentation attribute), que vence o
      // fill herdado do <g>. Por isso pintamos/limpamos o fill em cada path
      // descendente (inline style sobrescreve o attribute).
      const paint = (group: Element, color: string | null) => {
        // Apagado já é o cinza do tema (`figureTone`): sem a opacidade de
        // antes, que no escuro deixava o boneco claro e lavado.
        (group as SVGElement).style.opacity = '1';
        group.querySelectorAll('path, polygon, rect, circle, ellipse').forEach((shape) => {
          if (color) (shape as SVGElement).style.fill = color;
          else (shape as SVGElement).style.removeProperty('fill');
        });
      };

      themeFigure(doc);

      // Reset: todos os grupos esmaecidos e sem cor
      doc.querySelectorAll('g[data-muscle]').forEach((el) => paint(el, null));

      // O SVG é outro documento: as variáveis do tema não chegam lá, então a
      // cor do token é lida aqui e passada pronta.
      const token = (name: string) =>
        `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`;
      // `hsl(var(--x))` e `hsl(var(--x) / 0.2)` viram a cor resolvida.
      const resolve = (css: string) =>
        css.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
          getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
        );

      if (colors) {
        for (const [muscle, color] of Object.entries(colors)) {
          const value = resolve(color);
          doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => paint(el, value));
        }
        return;
      }

      // Secundários (água)
      const secondary = token('--water');
      secondaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => paint(el, secondary));
      });

      // Primários (verde da marca) — sobrescreve secundários no mesmo grupo
      const primary = token('--primary');
      primaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => paint(el, primary));
      });
    };

    const frontEl = frontRef.current;
    const backEl = backRef.current;

    if (frontEl) frontEl.onload = () => highlight(frontEl);
    if (backEl) backEl.onload = () => highlight(backEl);

    // Also try immediately if already loaded
    if (frontEl?.contentDocument?.readyState === 'complete') highlight(frontEl);
    if (backEl?.contentDocument?.readyState === 'complete') highlight(backEl);
  }, [primaryMuscles, secondaryMuscles, colors]);

  // `[color-scheme:normal]` nos `<object>`: o SVG não declara esquema de cor e,
  // com a página no escuro, o navegador pinta um fundo branco opaco atrás de
  // documento embutido de esquema diferente — era a caixa branca no card.
  return (
    // Os dois `<object>` são desenho: o grupo fala por eles, como no app.
    <div
      role="img"
      aria-label={label ?? describeMuscles(primaryMuscles, secondaryMuscles)}
      className="flex gap-2 justify-center"
    >
      {(view === 'front' || view === 'both') && (
        <object
          ref={frontRef}
          data="/muscle-front.svg"
          type="image/svg+xml"
          className={`pointer-events-none h-auto [color-scheme:normal] ${sizeClassName}`}
          aria-hidden
          tabIndex={-1}
        />
      )}
      {(view === 'back' || view === 'both') && (
        <object
          ref={backRef}
          data="/muscle-back.svg"
          type="image/svg+xml"
          className={`pointer-events-none h-auto [color-scheme:normal] ${sizeClassName}`}
          aria-hidden
          tabIndex={-1}
        />
      )}
    </div>
  );
}
