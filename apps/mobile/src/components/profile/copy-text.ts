export type CopyResult = 'copied' | 'failed';

/**
 * Copia e diz se deu certo. O `Clipboard.setStringAsync` do expo-clipboard pode
 * rejeitar (permissão, app em segundo plano) ou resolver `false`; nos dois casos
 * a tela precisa mandar copiar à mão, como na web.
 */
export async function copyText(
  write: (text: string) => Promise<boolean | void>,
  text: string,
): Promise<CopyResult> {
  try {
    return (await write(text)) === false ? 'failed' : 'copied';
  } catch {
    return 'failed';
  }
}
