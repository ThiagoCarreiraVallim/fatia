import type { INestApplication } from '@nestjs/common';
import { json, raw, type NextFunction, type Request, type Response } from 'express';

/**
 * Os dois corpos do chat que não cabem no parser global.
 *
 * O parser de JSON do Nest vale para toda rota e tem teto de 100 kB — o certo
 * para o resto da API. Um turno com foto passa disso, e o ditado nem é JSON. Os
 * dois ganham parser próprio **só na rota que precisa**: subir o teto global
 * abriria todas as outras rotas para corpos grandes.
 *
 * 🔴 Tem de ser registrado em `main.ts`, antes do `listen`. O parser global
 * entra na inicialização do Nest, depois de tudo que foi registrado com
 * `app.use`; um middleware de módulo (como o da foto em `nutrition.module.ts`)
 * já chegaria tarde para JSON, porque o global teria recusado o corpo antes.
 */

/** Por foto, depois de decodificada. O PWA reduz e recodifica bem abaixo disto. */
export const TETO_DA_FOTO_DO_CHAT = 2 * 1024 * 1024;
export const MAX_FOTOS_POR_MENSAGEM = 3;
/** O agente recusa acima do mesmo teto (`MAX_AUDIO_BYTES`). */
export const TETO_DO_AUDIO = 4 * 1024 * 1024;

// Base64 cresce 4/3; a folga cobre o resto do corpo (mensagem, ids).
const TETO_DO_TURNO = Math.ceil((TETO_DA_FOTO_DO_CHAT * MAX_FOTOS_POR_MENSAGEM * 4) / 3) + 64_000;

export function registrarCorposDoChat(app: INestApplication): void {
  const turno = json({ limit: TETO_DO_TURNO });
  const audio = raw({
    type: (req) => /^audio\//i.test(req.headers['content-type'] ?? ''),
    limit: TETO_DO_AUDIO,
  });
  app.use('/api/chat', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    if (req.path === '/') return turno(req, res, next);
    if (req.path === '/transcribe') return audio(req, res, next);
    return next();
  });
}
