import { imageProblem, videoProblem } from '@fatia/api-client';

/** O que o seletor do Expo devolve de uma imagem, no que interessa ao envio. */
export interface PickedAsset {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
  fileName?: string | null;
}

const PELA_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Tipo e tamanho da imagem escolhida, ou o recado para a pessoa. O Android às
 * vezes não diz o tipo: a extensão do nome (ou da URI) resolve. Sem o tamanho,
 * quem envia mede pelo corpo antes de pedir a URL.
 */
export function describePickedImage(
  asset: PickedAsset,
  measuredBytes?: number,
): { mime: string; bytes: number } | { problem: string } {
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  const mime = asset.mimeType || PELA_EXTENSAO[ext] || '';
  const bytes = measuredBytes ?? asset.fileSize ?? 0;
  const problem = imageProblem({ type: mime, size: bytes });
  return problem ? { problem } : { mime, bytes };
}

const VIDEO_PELA_EXTENSAO: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * O mesmo, para o vídeo do tutorial (Fase 7b). O iPhone entrega MOV, o
 * Android MP4; os dois servem, sem conversão.
 */
export function describePickedVideo(
  asset: PickedAsset,
  measuredBytes?: number,
): { mime: string; bytes: number } | { problem: string } {
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  const mime = asset.mimeType || VIDEO_PELA_EXTENSAO[ext] || '';
  const bytes = measuredBytes ?? asset.fileSize ?? 0;
  const problem = videoProblem({ type: mime, size: bytes });
  return problem ? { problem } : { mime, bytes };
}
