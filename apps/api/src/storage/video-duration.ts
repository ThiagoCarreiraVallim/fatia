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

export async function readVideoDurationMs(
  _read: ReadRange,
  _totalBytes: number,
): Promise<number | null> {
  return null;
}
