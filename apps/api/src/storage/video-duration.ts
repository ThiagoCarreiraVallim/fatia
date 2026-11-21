/**
 * A duração de um MP4/MOV, lida do cabeçalho `mvhd` dentro do `moov` (ISO BMFF),
 * sem baixar o vídeo: só os cabeçalhos das caixas de cima e o `moov` inteiro.
 *
 * O `moov` pode vir no começo (faststart) ou depois do `mdat` (o celular grava
 * assim): as caixas de cima são percorridas pelo tamanho de cada uma.
 *
 * `null` quando não dá para ler (sem `moov`, `mvhd` torto ou duração zero, como
 * no MP4 fragmentado): quem chama decide o que fazer com o desconhecido.
 */
export type ReadRange = (start: number, bytes: number) => Promise<Buffer>;

/** Teto do `moov` lido: o de um vídeo de 60 s tem poucos KB a alguns MB. */
export const MAX_MOOV_BYTES = 16 * 1024 * 1024;
/** Caixas de cima percorridas antes de desistir (ftyp, free, mdat, moov, udta...). */
const MAX_TOP_BOXES = 64;

export async function readVideoDurationMs(
  read: ReadRange,
  totalBytes: number,
): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < MAX_TOP_BOXES && offset + 8 <= totalBytes; i++) {
    const head = await read(offset, 16);
    if (head.length < 8) return null;
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let headerSize = 8;
    if (size === 1) {
      if (head.length < 16) return null;
      size = Number(head.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = totalBytes - offset; // vai até o fim do arquivo
    }
    if (size < headerSize) return null;
    if (type === 'moov') {
      if (size > MAX_MOOV_BYTES) return null;
      return mvhdDuration(await read(offset + headerSize, size - headerSize));
    }
    offset += size;
  }
  return null;
}

/** Procura o `mvhd` entre os filhos do `moov` e converte para milissegundos. */
function mvhdDuration(moov: Buffer): number | null {
  let o = 0;
  while (o + 8 <= moov.length) {
    const size = moov.readUInt32BE(o);
    const type = moov.toString('latin1', o + 4, o + 8);
    if (size < 8) return null;
    if (type === 'mvhd') {
      const b = moov.subarray(o + 8, o + size);
      const version = b.readUInt8(0);
      let timescale: number;
      let duration: number;
      if (version === 1) {
        if (b.length < 32) return null;
        timescale = b.readUInt32BE(20);
        duration = Number(b.readBigUInt64BE(24));
      } else {
        if (b.length < 20) return null;
        timescale = b.readUInt32BE(12);
        duration = b.readUInt32BE(16);
      }
      if (!timescale || !duration) return null;
      return Math.round((duration / timescale) * 1000);
    }
    o += size;
  }
  return null;
}
