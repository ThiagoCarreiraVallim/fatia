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

      // Reset all muscle groups to dimmed
      doc.querySelectorAll('g[data-muscle]').forEach((el) => {
        (el as SVGElement).style.opacity = '0.2';
        (el as SVGElement).style.fill = '';
      });

      // Highlight secondary muscles
      secondaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => {
          (el as SVGElement).style.opacity = '1';
          (el as SVGElement).style.fill = '#f97316';
        });
      });

      // Highlight primary muscles (overwrites secondary if same)
      primaryMuscles.forEach((muscle) => {
        doc.querySelectorAll(`g[data-muscle="${muscle}"]`).forEach((el) => {
          (el as SVGElement).style.opacity = '1';
          (el as SVGElement).style.fill = '#ef4444';
        });
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
