import { File, Paths } from 'expo-file-system';
import type { NewsFeed } from '@fatia/api-client';
import { parseNewsCache, type CachedNews } from './news-feed';

export { NEWS_QUERY_KEY, offlineFeed, type CachedNews } from './news-feed';

/**
 * A última lista de novidades, para a V11b ("Sem conexão · Mostrando o que já
 * estava salvo"). Um JSON pequeno na pasta de documentos do app (o app não tem
 * AsyncStorage, e o `expo-file-system` funciona no Expo Go). Só conveniência:
 * o lido/não lido de verdade mora na API. Toda falha aqui vira "sem cópia".
 */
function file(): File {
  return new File(Paths.document, 'fatia-novidades.json');
}

export function readNewsCache(): CachedNews | null {
  try {
    const f = file();
    return f.exists ? parseNewsCache(f.textSync()) : null;
  } catch {
    return null;
  }
}

export function writeNewsCache(feed: NewsFeed, now = new Date()): void {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify({ feed, savedAt: now.toISOString() }));
  } catch {
    // Sem cópia: com internet a tela continua igual.
  }
}
