import { readVideoDurationMs } from '../video-duration';
import { fragmentedMp4, mp4WithDuration } from './mp4-fixture';

const reader = (buf: Buffer) => async (start: number, bytes: number) =>
  buf.subarray(start, start + bytes);

describe('readVideoDurationMs (#408)', () => {
  it('lê a duração do mvhd com o moov no começo', async () => {
    const v = mp4WithDuration(24_000);
    expect(await readVideoDurationMs(reader(v), v.length)).toBe(24_000);
  });

  it('acha o moov depois de um mdat grande, sem ler o mdat', async () => {
    const v = mp4WithDuration(59_500, { moovAtEnd: true, mdatBytes: 50_000 });
    let lidos = 0;
    const r = async (start: number, bytes: number) => {
      lidos += bytes;
      return v.subarray(start, start + bytes);
    };
    expect(await readVideoDurationMs(r, v.length)).toBe(59_500);
    expect(lidos).toBeLessThan(5_000);
  });

  it('lê o mvhd versão 1 (64 bits)', async () => {
    const v = mp4WithDuration(90_000, { version: 1 });
    expect(await readVideoDurationMs(reader(v), v.length)).toBe(90_000);
  });

  it('MP4 fragmentado: lê a duração do mvex/mehd (o mvhd diz 0, #466)', async () => {
    const v0 = fragmentedMp4(600_000);
    expect(await readVideoDurationMs(reader(v0), v0.length)).toBe(600_000);
    const v1 = fragmentedMp4(75_000, { mehd: 1 });
    expect(await readVideoDurationMs(reader(v1), v1.length)).toBe(75_000);
  });

  it('MP4 fragmentado sem mehd: desconhecida (null)', async () => {
    const v = fragmentedMp4(600_000, { mehd: false });
    expect(await readVideoDurationMs(reader(v), v.length)).toBeNull();
  });

  it('devolve null sem moov', async () => {
    const v = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(64),
    ]);
    expect(await readVideoDurationMs(reader(v), v.length)).toBeNull();
  });
});
