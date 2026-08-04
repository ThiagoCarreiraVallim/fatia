import { NaoEhJpegError, pareceJpeg, removerMetadadosDoJpeg } from './strip-exif';

/**
 * A fixture é um JPEG **de verdade** — 32×32 de ruído, gerado por um encoder
 * real (Pillow) com EXIF real (piexif), incluindo GPS, marca, modelo e número de
 * série. Não é um Buffer inventado com a forma que eu imagino que o EXIF tenha:
 * essa é exatamente a armadilha que já custou caro aqui, e um
 * `Buffer.from('exif')` passaria em qualquer asserção ingênua sem provar nada.
 *
 * É ruído, e não uma cor sólida, porque cor sólida comprime sem produzir
 * `FF 00` — o byte stuffing que o teste do scan precisa ter para não ser vácuo.
 *
 * Coordenadas: 23°33'36"S 46°38'33"W — Praça da Sé, São Paulo. Se elas
 * sobreviverem ao stripper, a linha de `docs/DATA_RETENTION.md` que diz que o
 * Fatia não coleta localização está mentindo.
 */
const JPEG_COM_EXIF_GPS = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QEKRXhpZgAATU0AKgAAAAgABQEPAAIAAAAGAAAASgEQAAIA' +
    'AAAOAAAAUAExAAIAAAAJAAAAXodpAAQAAAABAAAAZ4glAAQAAAABAAAAoAAAAABBcHBsZQBpUGhv' +
    'bmUgMTUgUHJvAGlPUyAxOC4yAAACkAMAAgAAABQAAACBpDEAAgAAAAsAAACVMjAyNjowODowMyAx' +
    'MjozMDowMABGMkxaUThYS0pDAAAEAAEAAgAAAAJTAAAAAAIABQAAAAMAAADSAAMAAgAAAAJXAAAA' +
    'AAQABQAAAAMAAADqAAAAFwAAAAEAAAAhAAAAAQAADhAAAABkAAAALgAAAAEAAAAmAAAAAQAADOQA' +
    'AABk/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYGBgcJCAYHCQcGBggLCAkK' +
    'CgoKCgYICwwLCgwJCgoK/9sAQwECAgICAgIFAwMFCgcGBwoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK' +
    'CgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK/8AAEQgAIAAgAwEiAAIRAQMRAf/EAB8AAAEFAQEB' +
    'AQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNR' +
    'YQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldY' +
    'WVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TF' +
    'xsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAAB' +
    'AgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGx' +
    'wQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpz' +
    'dHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW' +
    '19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A5rxna/CvRbbVNH+JWi+GfAmqzaNq' +
    'Ed9bwMk02oBkTUZrhn04KiTr/aJDLHFfpayWduwdVuGI7K88F2/jjTdYntLi7+Ds58Oa54ZtF+H3' +
    'i+G6iWa9ube8gijktUDXs8omt9PS0jdYJJrZIo02xRKeci1P4y3PiWHWPGXgrS77/hGtS1axv9T8' +
    'M6fFYQLO2q3McFlYmzgvnhimvZpAZtgX+0NLis4xEkBkm19e+G3iC48MjwTffBC58T2srWlj/Y6Q' +
    'Kst7Gk9z9kttPhmK77i3Ej2+6yZ0ZbOCUSskrG4jFYqvioShGo3iJpxlOKjyuc5u04wck5zpUnGP' +
    's5Qm5c0FGUYKan005U7yoUq1oQbqX56kYck7ximq0nGmoxVnOTm5SjRXve0fJkw+CPifpukS/ArT' +
    '7f8As+61Ax7PF9zqH2620yG6a0t0dHaC63yWpNrYhBPJHHpmoywPIonlMZZ+IPHXh34k+APEd18a' +
    'NC8S6roetQ6vqtlq+o2kTWn2iSORxwd7pbWoe8uZredYYhBcvLOPKWe51LHSPDWnfEnxjf8AxJ8W' +
    'eCLqJvB921j4en1K9hg1spC8ds1zawyw3VxE13cXDurxXRe3aSa2jhLy5ydC8CfGf43+FjFpHg/4' +
    'eazr3hXwrZQ69q0cNzc6pNpViunLb3kulzW95Gl8VtlQpGwguiTJJtEMRXvxWPwGIwn1nESk7c8e' +
    'Zx54pOPJ7J1KrvOnWlV5asqbi41FFKDnJtbclTExr46vRSTacWlOahKahCm6b5ala6VJqVtUmqbU' +
    '6ftYTd+1n8Uvh7L8NvC+g6n4w0ax1HweZU0i11DWprmDTNINpGtwken2kFrBKzWUl+pikjntFgtp' +
    'LeJAMlN3WfEGkQ+INDXwhqF9YP4S1HVtY1DULLxrp1yqadqdzYRNaXdpNqzILdGW1sVRFuY3uEAt' +
    'gk9xFKM7X/HSDwXpWva9qmn67ZeINAnbVV0vWX1IXmsSjT4LMllujmW4ht3NtaxTRXDh3ZAktvbK' +
    '2Zpnx4g8F+A5/wDhWWtWes+F9CsLZ7TR7rWodXtLrTywuJfsJuIxendetJZbxayGOKQzYt5lu4Yp' +
    'w2CoSwOGo4WMoqlOVSf760bTb91wlSoqdLWq1Nwqw5pSklLn5TxsJgJYHGeyyqpKpWlF+0jy0oxl' +
    'eUW5pJVHCnGUpqnSlBR9mnVXLeMXo+EbrT/ip4ptl13Rvh3oy6rrl9ealqGoXlnFHpdohMRaSdLc' +
    'i5lWSyt4YbVrh7a4tft6rFMVD26/FP4Uxw6R4x8QeJFh0Kx0/wC1i4uvDum6SlprOpxNfOZUimgh' +
    'VpbjT9Mgmczm3iEcksiqvnwrPm+E7LVvFFt4mvfBHw21YanqGnNf3PiLxBpFhDZaQY4jdwzWqQT3' +
    '0s0/2t9SgdzKDC0YXy1uYGlg3PCfjPx5qHxH1jwDa2Xiax0Ga3urW30zwxp73TeGbSZ5obi8V2cX' +
    '0LwsGHlNGj3dxYxrbRRNbwz1GFw2f4LEzxuDhGMIKnKnJ1HHm9nLmkqcr1LqEVKCU+WKp8taVrq9' +
    '5p7mK+tQfuqpKdJ3i1enJTpS96MXSUW581Oaq1FGNRVWrwnL/9k=',
  'base64',
);

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
