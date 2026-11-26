import { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';

/** As células escuras do QR (JS puro, sem módulo nativo: roda no Expo Go). */
function qrCells(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * O QR do link de convite (#372, Onb-C4) — equivalente de
 * `apps/web/src/components/org/invite-qr.tsx`. Sempre preto no branco, também
 * no tema escuro: leitor de QR precisa de contraste e borda clara.
 */
export function InviteQr({ url, size = 180 }: { url: string; size?: number }) {
  const cells = useMemo(() => qrCells(url), [url]);
  const margem = 4;
  const total = cells.length + margem * 2;
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={`QR do link ${url}`}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
    >
      <Rect width={total} height={total} fill="#ffffff" />
      {cells.flatMap((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <Rect
              key={`${r}-${c}`}
              x={c + margem}
              y={r + margem}
              width={1.02}
              height={1.02}
              fill="#000000"
            />
          ) : null,
        ),
      )}
    </Svg>
  );
}
