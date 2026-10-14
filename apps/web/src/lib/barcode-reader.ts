/**
 * Leitura de código de barras num `<video>` que já está tocando a câmera.
 *
 * Duas pontas, a mesma interface:
 * - `BarcodeDetector` nativo (Chrome no Android, Edge, Chrome no macOS), que é
 *   rápido e não custa download;
 * - `@zxing/browser`, JavaScript puro, para onde o nativo não existe (Safari,
 *   Firefox, Chrome no Windows e no Linux). Entra por `import()` só aqui, então
 *   quem nunca abre o leitor não baixa o zxing.
 *
 * Os formatos são os do app (EAN-13, EAN-8, UPC-A, UPC-E). Sem QR Code: com ele
 * ligado, qualquer adesivo enquadrado sem querer dispara a consulta.
 */

export interface BarcodeReader {
  stop: () => void;
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 250;

interface NativeDetector {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats: () => Promise<string[]>;
}

async function nativeDetector(): Promise<NativeDetector | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = await Detector.getSupportedFormats();
    // Há navegador que expõe a classe sem nenhum formato de produto (Chrome no
    // Linux sem o serviço de detecção). Aí o zxing é a única saída.
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    return formats.length > 0 ? new Detector({ formats }) : null;
  } catch {
    return null;
  }
}

function startNative(
  detector: NativeDetector,
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): BarcodeReader {
  let busy = false;
  const timer = setInterval(() => {
    if (busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    busy = true;
    detector
      .detect(video)
      .then((codes) => {
        const code = codes[0]?.rawValue;
        if (code) onCode(code);
      })
      // Quadro ruim não é erro de leitura: o próximo intervalo tenta de novo.
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, SCAN_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}

async function startZxing(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<BarcodeReader> {
  const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<number, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
    ],
  ]);
  const reader = new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: SCAN_INTERVAL_MS,
  });
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) onCode(result.getText());
  });
  return { stop: () => controls.stop() };
}

export async function startBarcodeReader(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<BarcodeReader> {
  const native = await nativeDetector();
  return native ? startNative(native, video, onCode) : startZxing(video, onCode);
}
