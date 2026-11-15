import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { AgentLabel } from '../ai/agent.adapter';
import { HostedAiService } from '../ai/hosted-ai.service';
import { MAX_FOTO_BYTES } from './meal-recognition.service';
import { NaoEhJpegError, removerMetadadosDoJpeg } from './helpers/strip-exif';
import { MAX_KCAL_PER_100G, MAX_MACROS_PER_100G } from './food.service';

/**
 * Leitura do rótulo por foto (#375, absorve a #333).
 *
 * **Não grava nada, e a foto não fica.** Ela chega como Buffer, perde os
 * metadados, vai ao agente em base64 e some com o fim da requisição: a ADR 038
 * (item 4) só guarda a foto que vira refeição, e rótulo não vira. O que volta
 * são números para a pessoa conferir no formulário do alimento próprio
 * (Al-N11), que é o único caminho de gravação.
 *
 * Plano, cota, a chamada e o custo (`AiUsage`, `label_photo`) são do
 * `HostedAiService`, o mesmo portão da foto do prato.
 */

/** O que a tela recebe: os números como estão no rótulo, na base que `basis` diz. */
export interface LabelReading {
  name: string | null;
  /** `100g`: a coluna por 100 g; `serving`: por porção de `servingGrams`. */
  basis: 'serving' | '100g';
  servingGrams: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  note: string | null;
}

/** Os limites do alimento próprio: nome e porção. */
const MAX_NAME = 160;
const MAX_SERVING_GRAMS = 2000;
/** 100 g de sal têm ~39 000 mg de sódio; acima disso é erro de leitura. */
const MAX_SODIUM_MG = 40_000;
const MAX_NOTE = 280;

/**
 * Número que o modelo leu, ou `null`. **Nunca zero no lugar de "não li"**: o
 * formulário mostra o campo em branco e a pessoa completa pelo rótulo (a mesma
 * regra da ficha incompleta do Open Food Facts, ADR 017).
 *
 * O teto é o de 100 g, escalado pela porção quando os números são por porção
 * (300 g de lasanha passam de 900 kcal). A conversão para 100 g é conferida de
 * novo no formulário e na API.
 */
function reading(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function serving(value: unknown): number | null {
  const n = reading(value, MAX_SERVING_GRAMS);
  return n !== null && n > 0 ? n : null;
}

@Injectable()
export class LabelReadingService {
  constructor(private readonly hostedAi: HostedAiService) {}

  async read(userId: string, photo: Buffer): Promise<LabelReading> {
    if (photo.length === 0) throw new BadRequestException('Nenhuma imagem foi enviada.');
    if (photo.length > MAX_FOTO_BYTES) {
      throw new PayloadTooLargeException(
        `A foto tem ${photo.length} bytes e o limite é ${MAX_FOTO_BYTES}. Reduza a resolução.`,
      );
    }

    let withoutMetadata: Buffer;
    try {
      withoutMetadata = removerMetadadosDoJpeg(photo);
    } catch (err) {
      if (err instanceof NaoEhJpegError) {
        throw new BadRequestException('A imagem precisa ser um JPEG.');
      }
      throw err;
    }

    return sanitize(await this.hostedAi.readLabel(userId, withoutMetadata));
  }
}

function sanitize(label: AgentLabel): LabelReading {
  const basis = label.per === 'serving' ? 'serving' : '100g';
  const servingGrams = serving(label.serving_grams);
  const scale = basis === 'serving' ? Math.max(1, (servingGrams ?? MAX_SERVING_GRAMS) / 100) : 1;
  return {
    name: text(label.name, MAX_NAME),
    basis,
    servingGrams,
    kcal: reading(label.kcal, MAX_KCAL_PER_100G * scale),
    proteinG: reading(label.protein_g, MAX_MACROS_PER_100G * scale),
    carbsG: reading(label.carbs_g, MAX_MACROS_PER_100G * scale),
    fatG: reading(label.fat_g, MAX_MACROS_PER_100G * scale),
    fiberG: reading(label.fiber_g, MAX_MACROS_PER_100G * scale),
    sodiumMg: reading(label.sodium_mg, MAX_SODIUM_MG * scale),
    note: text(label.note, MAX_NOTE),
  };
}
