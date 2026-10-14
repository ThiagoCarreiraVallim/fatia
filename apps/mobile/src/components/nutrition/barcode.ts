/**
 * O que o scanner tem de próprio do app: os formatos do `expo-camera`.
 *
 * A lógica pura da leitura (trava, porções, prévia, item livre, ficha
 * incompleta) é comum ao PWA e vive em `@fatia/api-client` (`barcode.ts`).
 */

/**
 * Formatos lidos. EAN-13 cobre praticamente todo produto de mercado brasileiro
 * (prefixo 789/790); EAN-8 aparece em embalagem pequena e UPC em importado.
 *
 * A lista é fechada de propósito: deixar o QR Code ligado faz a câmera disparar
 * com qualquer adesivo de propaganda apontado sem querer.
 */
export const TIPOS_DE_CODIGO = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
