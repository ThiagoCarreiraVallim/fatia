'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** As células escuras do QR, em linhas e colunas (JS puro, sem módulo nativo). */
function qrCells(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** O SVG do QR como texto, para baixar e imprimir na recepção. */
export function qrSvgMarkup(text: string, cell = 8, margin = 4): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin, scalable: true });
}

/**
 * O QR do link de convite (Pn-06b). Sempre preto no branco, também no tema
 * escuro: leitor de QR precisa de contraste e borda clara.
 */
export function InviteQr({ url, size = 160 }: { url: string; size?: number }) {
  const cells = useMemo(() => qrCells(url), [url]);
  const n = cells.length;
  const margem = 4;
  const total = n + margem * 2;
  return (
    <svg
      role="img"
      aria-label={`QR do link ${url}`}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-xl"
    >
      <rect width={total} height={total} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + margem}
              y={r + margem}
              width={1}
              height={1}
              fill="#000000"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
