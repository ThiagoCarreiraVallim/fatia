/**
 * Corte quadrado da foto de perfil, no navegador, antes do envio (prancha
 * Al-V9: "A foto é cortada em círculo"). O centro da imagem vira um quadrado
 * de no máximo 768 px — o círculo é só a máscara na tela. A API ainda tira o
 * EXIF e converte para WebP; aqui o canvas já descarta os metadados.
 */

export const AVATAR_SIZE_PX = 768;

/** O quadrado central de uma imagem `w × h`, para o `drawImage`. */
export function centerSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

export async function cropAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
    const out = Math.min(side, AVATAR_SIZE_PX);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('corte falhou'))), 'image/jpeg', 0.9),
    );
  } finally {
    bitmap.close();
  }
}
