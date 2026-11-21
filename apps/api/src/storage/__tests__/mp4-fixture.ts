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

/**
 * MP4 fragmentado (`-movflags frag_keyframe`): o `mvhd` diz 0 e a duração,
 * quando vem, está no `mvex/mehd` (versão 0 ou 1). Sem `mehd`, nada no
 * cabeçalho diz quanto o vídeo dura.
 */
export function fragmentedMp4(
  durationMs: number,
  opts: { mehd?: 0 | 1 | false; fragments?: number } = {},
): Buffer {
  const ftyp = box('ftyp', Buffer.from('iso5\0\0\0\0iso5iso6mp41', 'latin1'));
  const timescale = 1000;
  const mvhdBody = Buffer.alloc(100);
  mvhdBody.writeUInt32BE(timescale, 12);
  const children = [box('mvhd', mvhdBody), box('trak', Buffer.alloc(16))];
  if (opts.mehd !== false) {
    let mehd: Buffer;
    if (opts.mehd === 1) {
      mehd = Buffer.alloc(12);
      mehd.writeUInt8(1, 0);
      mehd.writeBigUInt64BE(BigInt(durationMs), 4);
    } else {
      mehd = Buffer.alloc(8);
      mehd.writeUInt32BE(durationMs, 4);
    }
    children.push(box('mvex', Buffer.concat([box('mehd', mehd), box('trex', Buffer.alloc(24))])));
  }
  const frags: Buffer[] = [];
  for (let i = 0; i < (opts.fragments ?? 4); i++) {
    frags.push(box('moof', Buffer.alloc(32)), box('mdat', Buffer.alloc(256)));
  }
  return Buffer.concat([ftyp, box('moov', Buffer.concat(children)), ...frags]);
}
