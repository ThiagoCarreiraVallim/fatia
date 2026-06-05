'use client';

import { useEffect, useRef } from 'react';

interface MuscleDiagramProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  view?: 'front' | 'back' | 'both';
}

export function MuscleDiagram({
  primaryMuscles,
  secondaryMuscles = [],
  view = 'both',
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
        (group as SVGElement).style.opacity = color ? '1' : '0.2';
        group.querySelectorAll('path, polygon, rect, circle, ellipse').forEach((shape) => {
          if (color) (shape as SVGElement).style.fill = color;
          else (shape as SVGElement).style.removeProperty('fill');
        });
      };

      // Reset: todos os grupos esmaecidos e sem cor
      doc.querySelectorAll('g[data-muscle]').forEach((el) => paint(el, null));

      // Secundários (laranja)
      secondaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => paint(el, '#f97316'));
      });

      // Primários (vermelho) — sobrescreve secundários no mesmo grupo
      primaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => paint(el, '#ef4444'));
      });
    };

    const frontEl = frontRef.current;
    const backEl = backRef.current;

    if (frontEl) frontEl.onload = () => highlight(frontEl);
    if (backEl) backEl.onload = () => highlight(backEl);

    // Also try immediately if already loaded
    if (frontEl?.contentDocument?.readyState === 'complete') highlight(frontEl);
    if (backEl?.contentDocument?.readyState === 'complete') highlight(backEl);
  }, [primaryMuscles, secondaryMuscles]);

  return (
    <div className="flex gap-2 justify-center">
      {(view === 'front' || view === 'both') && (
        // eslint-disable-next-line react/no-unknown-property
        <object
          ref={frontRef}
          data="/muscle-front.svg"
          type="image/svg+xml"
          className="w-32 h-auto"
          aria-label="Vista frontal"
        />
      )}
      {(view === 'back' || view === 'both') && (
        // eslint-disable-next-line react/no-unknown-property
        <object
          ref={backRef}
          data="/muscle-back.svg"
          type="image/svg+xml"
          className="w-32 h-auto"
          aria-label="Vista posterior"
        />
      )}
    </div>
  );
}
