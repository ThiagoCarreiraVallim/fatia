/**
 * A duração de um MP4/MOV, lida do cabeçalho `mvhd` dentro do `moov` (ISO BMFF),
 * sem baixar o vídeo: só os cabeçalhos das caixas de cima e o `moov` inteiro.
 *
 * O `moov` pode vir no começo (faststart) ou depois do `mdat` (o celular grava
 * assim): as caixas de cima são percorridas pelo tamanho de cada uma.
 *
 * No MP4 fragmentado o `mvhd` diz 0 e a duração está no `mvex/mehd` (#466);
 * vale a maior das duas.
 *
 * `null` quando não dá para ler (sem `moov`, `mvhd` torto, fragmentado sem
 * `mehd`, `moov` grande demais ou caixas demais antes dele): quem chama decide
 * o que fazer com o desconhecido.
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
      return moovDuration(await read(offset + headerSize, size - headerSize));
    }
    offset += size;
  }
  return null;
}

/** Os filhos diretos de uma caixa: tipo e corpo. Caixa torta para a leitura. */
function children(parent: Buffer): { type: string; body: Buffer }[] | null {
  const out: { type: string; body: Buffer }[] = [];
  let o = 0;
  while (o + 8 <= parent.length) {
    const size = parent.readUInt32BE(o);
    if (size < 8 || o + size > parent.length) return null;
    out.push({
      type: parent.toString('latin1', o + 4, o + 8),
      body: parent.subarray(o + 8, o + size),
    });
    o += size;
  }
  return out;
}

/** O `mvhd` (escala e duração) e o `mvex/mehd` do `moov`, em milissegundos. */
function moovDuration(moov: Buffer): number | null {
  const boxes = children(moov);
  const mvhd = boxes?.find((b) => b.type === 'mvhd')?.body;
  if (!boxes || !mvhd) return null;
  const version = mvhd.readUInt8(0);
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (mvhd.length < 32) return null;
    timescale = mvhd.readUInt32BE(20);
    duration = Number(mvhd.readBigUInt64BE(24));
  } else {
    if (mvhd.length < 20) return null;
    timescale = mvhd.readUInt32BE(12);
    duration = mvhd.readUInt32BE(16);
  }
  if (!timescale) return null;
  // Fragmentado: a duração do filme inteiro, na mesma escala do `mvhd`.
  const mvex = boxes.find((b) => b.type === 'mvex')?.body;
  const mehd = mvex ? children(mvex)?.find((b) => b.type === 'mehd')?.body : undefined;
  if (mehd && mehd.length >= 8) {
    const fragmented =
      mehd.readUInt8(0) === 1 && mehd.length >= 12
        ? Number(mehd.readBigUInt64BE(4))
        : mehd.readUInt32BE(4);
    duration = Math.max(duration, fragmented);
  }
  if (!duration) return null;
  return Math.round((duration / timescale) * 1000);
}
