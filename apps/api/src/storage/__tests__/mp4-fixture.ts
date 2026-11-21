/** Uma caixa ISO BMFF: tamanho (32 bits), tipo e o corpo. */
function box(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/**
 * Um MP4 mínimo com a duração no `mvhd` (versão 0 ou 1). `moovAtEnd` põe o
 * `moov` depois do `mdat`, como o celular grava. O `mdat` é só enchimento.
 */
export function mp4WithDuration(
  durationMs: number,
  opts: { moovAtEnd?: boolean; version?: 0 | 1; mdatBytes?: number } = {},
): Buffer {
  const ftyp = box('ftyp', Buffer.from('mp42\0\0\0\0mp42isom', 'latin1'));
  const timescale = 600;
  const duration = Math.round((durationMs / 1000) * timescale);
  let mvhdBody: Buffer;
  if (opts.version === 1) {
    mvhdBody = Buffer.alloc(4 + 8 + 8 + 4 + 8 + 80);
    mvhdBody.writeUInt8(1, 0);
    mvhdBody.writeUInt32BE(timescale, 20);
    mvhdBody.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    mvhdBody = Buffer.alloc(4 + 4 + 4 + 4 + 4 + 80);
    mvhdBody.writeUInt32BE(timescale, 12);
    mvhdBody.writeUInt32BE(duration, 16);
  }
  const moov = box('moov', Buffer.concat([box('mvhd', mvhdBody), box('trak', Buffer.alloc(16))]));
  const mdat = box('mdat', Buffer.alloc(opts.mdatBytes ?? 256));
  return opts.moovAtEnd ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}
