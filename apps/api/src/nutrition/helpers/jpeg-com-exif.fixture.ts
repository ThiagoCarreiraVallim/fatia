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
export const JPEG_COM_EXIF_GPS = Buffer.from(
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
