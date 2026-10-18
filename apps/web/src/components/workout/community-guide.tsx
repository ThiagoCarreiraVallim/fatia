'use client';

import { Users } from 'lucide-react';
import type { CommunityGuide } from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';

/**
 * O tutorial que a comunidade da pessoa gravou para o exercício (Fase 7b): o
 * vídeo dela no lugar do YouTube, as fotos e as dicas.
 */
export function CommunityGuideSection({
  guide,
  exerciseName,
}: {
  guide: CommunityGuide;
  exerciseName: string;
}) {
  const fotos = guide.photos.filter((f) => f.url);
  if (!guide.video?.url && fotos.length === 0 && !guide.tips) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Exercício de {guide.groupName}
      </p>
    );
  }
  return (
    <section aria-label={`Tutorial de ${guide.groupName}`} className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Tutorial de {guide.groupName}
      </p>
      {guide.video?.url && (
        <video
          src={guide.video.url}
          controls
          playsInline
          preload="metadata"
          poster={fotos[0]?.url ?? undefined}
          aria-label={`Demonstração: ${exerciseName}`}
          className="aspect-video w-full rounded-xl bg-black"
        />
      )}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2" aria-label="Fotos do tutorial">
          {fotos.map((f, i) => (
            <li key={f.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
              <img
                src={f.url!}
                alt={`${exerciseName}, foto ${i + 1}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
            </li>
          ))}
        </ul>
      )}
      {guide.tips && (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <MarkdownLite source={guide.tips} />
        </div>
      )}
    </section>
  );
}
