import { JPEG_COM_EXIF_GPS } from './jpeg-com-exif.fixture';
import { NaoEhJpegError, pareceJpeg, removerMetadadosDoJpeg } from './strip-exif';

/** Marcadores presentes no buffer, na ordem, como bytes `0xFFxx`. */
function marcadoresAte(bytes: Buffer, ateSos = true): number[] {
  const encontrados: number[] = [];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const tipo = bytes[i + 1];
    encontrados.push(tipo);
    if (tipo === 0xda && ateSos) break;
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return encontrados;
}

describe('removerMetadadosDoJpeg', () => {
  it('a fixture é um JPEG com EXIF, GPS e identificação do aparelho', () => {
    // Sem esta asserção o teste seguinte seria vacuoso: um buffer sem EXIF
    // "passa" no stripper trivialmente, e nada avisaria.
    expect(pareceJpeg(JPEG_COM_EXIF_GPS)).toBe(true);
    expect(marcadoresAte(JPEG_COM_EXIF_GPS)).toContain(0xe1); // APP1 = Exif
    expect(JPEG_COM_EXIF_GPS.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(true);
    expect(JPEG_COM_EXIF_GPS.includes(Buffer.from('iPhone 15 Pro'))).toBe(true);
    expect(JPEG_COM_EXIF_GPS.includes(Buffer.from('F2LZQ8XKJC'))).toBe(true);
  });

  it('remove o EXIF inteiro — GPS, marca, modelo e número de série', () => {
    const limpo = removerMetadadosDoJpeg(JPEG_COM_EXIF_GPS);

    expect(limpo.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
    expect(limpo.includes(Buffer.from('iPhone 15 Pro'))).toBe(false);
    expect(limpo.includes(Buffer.from('Apple'))).toBe(false);
    expect(limpo.includes(Buffer.from('F2LZQ8XKJC'))).toBe(false);
    expect(limpo.includes(Buffer.from('2026:08:03 12:30:00'))).toBe(false);
    // Nenhum APPn sobrevive: procurar só por "Exif" deixaria passar XMP (APP1
    // sem o header Exif) e IPTC (APP13), que carregam autor e localização
    // textual pelos mesmos motivos.
    expect(marcadoresAte(limpo).filter((tipo) => tipo >= 0xe0 && tipo <= 0xef)).toEqual([]);
  });

  it('preserva a imagem: continua um JPEG com quantização, Huffman e scan', () => {
    const limpo = removerMetadadosDoJpeg(JPEG_COM_EXIF_GPS);

    expect(pareceJpeg(limpo)).toBe(true);
    const marcadores = marcadoresAte(limpo);
    expect(marcadores).toContain(0xdb); // DQT
    expect(marcadores).toContain(0xc0); // SOF0
    expect(marcadores).toContain(0xc4); // DHT
    expect(marcadores).toContain(0xda); // SOS
    expect(limpo.subarray(limpo.length - 2)).toEqual(Buffer.from([0xff, 0xd9])); // EOI
    expect(limpo.length).toBeLessThan(JPEG_COM_EXIF_GPS.length);
  });

  it('é idempotente — passar de novo não muda nem quebra', () => {
    const uma = removerMetadadosDoJpeg(JPEG_COM_EXIF_GPS);

    expect(removerMetadadosDoJpeg(uma)).toEqual(uma);
  });

  it('não confunde 0xFF dentro dos dados comprimidos com marcador', () => {
    // O byte stuffing do JPEG escreve `FF 00` no meio do scan. Um laço que
    // continuasse procurando segmentos depois do SOS trataria isso como
    // marcador desconhecido e cortaria a imagem ao meio.
    const limpo = removerMetadadosDoJpeg(JPEG_COM_EXIF_GPS);
    const scanLimpo = limpo.subarray(limpo.indexOf(Buffer.from([0xff, 0xda])));
    const scanOriginal = JPEG_COM_EXIF_GPS.subarray(
      JPEG_COM_EXIF_GPS.indexOf(Buffer.from([0xff, 0xda])),
    );

    // Guarda contra o teste virar vácuo: se a fixture deixasse de ter stuffing,
    // a asserção de igualdade abaixo passaria sem exercitar nada.
    expect(scanOriginal.includes(Buffer.from([0xff, 0x00]))).toBe(true);
    // Byte a byte: os dados comprimidos saem intactos, não "quase".
    expect(scanLimpo).toEqual(scanOriginal);
  });

  it('recusa bytes que não são JPEG em vez de mandá-los ao provedor', () => {
    // O `Content-Type` vem do cliente e não prova nada. Um PNG (ou um PDF)
    // repassado como se fosse foto vira um 400 sem explicação do provedor, que
    // chega à pessoa como "a IA falhou".
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(() => removerMetadadosDoJpeg(png)).toThrow(NaoEhJpegError);
    expect(() => removerMetadadosDoJpeg(Buffer.alloc(0))).toThrow(NaoEhJpegError);
  });

  it('recusa segmento com tamanho inválido em vez de travar', () => {
    // Tamanho 0 faria o cursor andar para trás e o laço nunca terminar — isso é
    // travamento do processo, não erro de validação.
    const torto = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00, 0xff, 0xd9]);

    expect(() => removerMetadadosDoJpeg(torto)).toThrow(NaoEhJpegError);
  });
});
