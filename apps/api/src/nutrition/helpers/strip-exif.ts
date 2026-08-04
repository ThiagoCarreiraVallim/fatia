/**
 * Remove os metadados de um JPEG antes que ele saia da nossa infraestrutura (#139).
 *
 * **Por que isto existe, e por que aqui.** `docs/DATA_RETENTION.md` afirma, na
 * seção "Dados que NÃO são armazenados", que o Fatia não coleta localização. A
 * foto de refeição é a primeira coisa que sai do aparelho e vai para um terceiro
 * (o provedor de visão), e o EXIF de uma foto de celular carrega **GPS**, modelo
 * do aparelho, número de série e data/hora exata. Sem esta função, aquela
 * afirmação viraria falsa sem ninguém editar uma linha de texto.
 *
 * **Por que na API e não no aplicativo.** Fazer no aparelho seria mais barato em
 * banda, mas seria uma promessa que depende do cliente: versão antiga do app,
 * PWA que ainda vai existir, um `curl` de quem tem token. A API é o último ponto
 * que controlamos antes do terceiro, e a garantia tem de estar onde ela não
 * depende de quem chama. O app também reduz e recodifica a foto — isso é
 * economia de banda, não é a garantia.
 *
 * **O que é removido:** todo segmento `APPn` (0xFFE0–0xFFEF), que é onde vivem
 * EXIF (APP1), XMP (APP1), IPTC/Photoshop (APP13) e o perfil ICC (APP2), e todo
 * comentário `COM` (0xFFFE). Fica só o que descreve os pixels.
 *
 * O JFIF (APP0) sai junto de propósito: ele só carrega densidade e miniatura, e
 * decodificador nenhum precisa dele — a miniatura, aliás, é uma segunda cópia da
 * imagem que sobreviveria a um recorte feito para esconder algo.
 */

const MARCADOR = 0xff;
const SOI = 0xd8; // Start of Image
const EOI = 0xd9; // End of Image
const SOS = 0xda; // Start of Scan — daqui em diante são os dados comprimidos
const COM = 0xfe; // Comentário
const APP0 = 0xe0;
const APP15 = 0xef;

/** Marcadores sem payload: não têm campo de tamanho para pular. */
const SEM_TAMANHO = new Set([
  0x01, // TEM
  ...Array.from({ length: 8 }, (_, i) => 0xd0 + i), // RST0..RST7
]);

export class NaoEhJpegError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'NaoEhJpegError';
  }
}

/** `true` se os bytes começam com o marcador SOI de um JPEG. */
export function pareceJpeg(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === MARCADOR && bytes[1] === SOI;
}

/**
 * Devolve o mesmo JPEG sem `APPn` e sem `COM`.
 *
 * Levanta `NaoEhJpegError` quando os bytes não são um JPEG válido. Isso não é
 * só higiene: o `Content-Type` vem do cliente e não prova nada, e mandar um
 * arquivo qualquer adiante como se fosse foto faz o provedor responder um 400
 * sem explicação, que chega ao usuário como "a IA falhou".
 */
export function removerMetadadosDoJpeg(bytes: Buffer): Buffer {
  if (!pareceJpeg(bytes)) {
    throw new NaoEhJpegError('Os bytes recebidos não começam com o marcador SOI de um JPEG.');
  }

  const pedacos: Buffer[] = [bytes.subarray(0, 2)];
  let posicao = 2;

  while (posicao < bytes.length) {
    if (bytes[posicao] !== MARCADOR) {
      throw new NaoEhJpegError(`Byte ${posicao} deveria abrir um marcador (0xFF) e não abre.`);
    }

    // Uma sequência de 0xFF é preenchimento legítimo antes do marcador.
    let cursor = posicao + 1;
    while (cursor < bytes.length && bytes[cursor] === MARCADOR) cursor += 1;
    if (cursor >= bytes.length) {
      throw new NaoEhJpegError('O arquivo termina no meio de um marcador.');
    }

    const tipo = bytes[cursor];
    cursor += 1;

    if (tipo === EOI) {
      pedacos.push(Buffer.from([MARCADOR, EOI]));
      break;
    }

    if (SEM_TAMANHO.has(tipo)) {
      pedacos.push(Buffer.from([MARCADOR, tipo]));
      posicao = cursor;
      continue;
    }

    if (cursor + 2 > bytes.length) {
      throw new NaoEhJpegError('O arquivo termina antes do tamanho do segmento.');
    }
    const tamanho = bytes.readUInt16BE(cursor);
    // O campo de tamanho conta a si mesmo; menor que 2 seria um segmento
    // negativo e faria o laço andar para trás — travamento, não erro.
    if (tamanho < 2 || cursor + tamanho > bytes.length) {
      throw new NaoEhJpegError(`Segmento 0xFF${tipo.toString(16)} com tamanho inválido.`);
    }

    const descartavel = (tipo >= APP0 && tipo <= APP15) || tipo === COM;
    if (!descartavel) {
      pedacos.push(bytes.subarray(posicao, cursor + tamanho));
    }
    posicao = cursor + tamanho;

    if (tipo === SOS) {
      // Depois do SOS vêm os dados comprimidos, que não são segmentos e podem
      // conter 0xFF seguido de qualquer coisa. Não há mais metadado a remover:
      // copia o resto cru. Percorrer byte a byte daqui em diante seria reescrever
      // um decodificador de JPEG para não ganhar nada.
      pedacos.push(bytes.subarray(posicao));
      posicao = bytes.length;
    }
  }

  return Buffer.concat(pedacos);
}
