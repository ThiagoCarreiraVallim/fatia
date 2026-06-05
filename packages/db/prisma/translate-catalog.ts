/**
 * Gera o catálogo base completo (os 300 exercícios da free-exercise-db) em PORTUGUÊS,
 * traduzindo automaticamente nome e instruções, e popula a base no banco.
 *
 * - nome + instruções: traduzidos via API (DeepL se DEEPL_API_KEY estiver setado,
 *   senão o endpoint gratuito do Google Tradutor).
 * - equipment / muscleGroup: determinístico (mapas abaixo) — não gasta API.
 * - primaryMuscles / secondaryMuscles: ficam em INGLÊS (chaves do diagrama → cores).
 *
 * Upsert por nome (base = createdByUserId null) e poda segura dos exercícios base
 * antigos que ficaram fora do catálogo e não estão em uso (sem sets/planos/cópias).
 *
 * Rodar no Dokploy (api → Open Terminal):
 *   cd /app && pnpm dlx tsx packages/db/prisma/translate-catalog.ts
 *   # opcional, melhor qualidade: DEEPL_API_KEY=xxxx pnpm dlx tsx packages/db/prisma/translate-catalog.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const ALLOWED_CATEGORIES = new Set([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'plyometrics',
]);
const MAX_EXERCISES = 300;

const EQUIPMENT_PT: Record<string, string> = {
  'body only': 'peso corporal',
  barbell: 'barra',
  dumbbell: 'halteres',
  cable: 'polia',
  machine: 'máquina',
  kettlebells: 'kettlebell',
  bands: 'elástico',
  'e-z curl bar': 'barra W',
  'exercise ball': 'bola suíça',
  'foam roll': 'rolo de espuma',
  'medicine ball': 'bola medicinal',
  other: 'outro',
};

function toMuscleGroup(primaryMuscles: string[]): string {
  const m = (primaryMuscles[0] ?? '').toLowerCase();
  if (m === 'chest') return 'peito';
  if (['lats', 'middle back', 'lower back', 'traps'].includes(m)) return 'costas';
  if (['quadriceps', 'hamstrings', 'calves', 'glutes', 'adductors', 'abductors'].includes(m))
    return 'pernas';
  if (['shoulders', 'neck'].includes(m)) return 'ombro';
  if (['biceps', 'triceps', 'forearms'].includes(m)) return 'braço';
  if (m === 'abdominals') return 'core';
  return 'outros';
}

interface RawExercise {
  name: string;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
}

// ---- Tradução ----
const cache = new Map<string, string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEEPL_KEY = process.env.DEEPL_API_KEY;

async function deepl(text: string): Promise<string> {
  const host = DEEPL_KEY?.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ text, source_lang: 'EN', target_lang: 'PT-BR' }),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}`);
  const data = (await res.json()) as { translations: { text: string }[] };
  return data.translations[0]?.text ?? text;
}

async function googleFree(text: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=' +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = (await res.json()) as [Array<[string]>];
  return (data[0] ?? []).map((seg) => seg[0]).join('');
}

async function translate(text: string): Promise<string> {
  const t = text?.trim();
  if (!t) return text;
  const hit = cache.get(t);
  if (hit !== undefined) return hit;

  let out = t;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      out = DEEPL_KEY ? await deepl(t) : await googleFree(t);
      break;
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ! falha ao traduzir (mantendo EN): "${t.slice(0, 40)}..."`, String(err));
        out = t;
      } else {
        await sleep(1000 * (attempt + 1)); // backoff
      }
    }
  }
  cache.set(t, out);
  await sleep(DEEPL_KEY ? 60 : 200); // respeita rate limit
  return out;
}

async function main() {
  const dataPath = path.join(__dirname, 'data', 'exercises-en.json');
  const raw: RawExercise[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const items = raw
    .filter((e) => ALLOWED_CATEGORIES.has(e.category) && e.equipment != null)
    .slice(0, MAX_EXERCISES);

  console.log(
    `Traduzindo ${items.length} exercícios (${DEEPL_KEY ? 'DeepL' : 'Google grátis'})...`,
  );

  let created = 0;
  let updated = 0;
  const keepNames = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const ex = items[i];
    const name = await translate(ex.name);
    const instructions: string[] = [];
    for (const step of ex.instructions) instructions.push(await translate(step));

    keepNames.add(name);
    const data = {
      muscleGroup: toMuscleGroup(ex.primaryMuscles),
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment ? (EQUIPMENT_PT[ex.equipment] ?? ex.equipment) : null,
      level: ex.level ?? null,
      mechanic: ex.mechanic ?? null,
      instructions,
    };

    const existing = await prisma.exercise.findFirst({
      where: { name, createdByUserId: null },
    });
    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.exercise.create({ data: { name, createdByUserId: null, ...data } });
      created++;
    }

    if ((i + 1) % 25 === 0) console.log(`  ... ${i + 1}/${items.length}`);
  }

  // Poda segura dos exercícios base fora do novo catálogo e sem uso.
  const stale = await prisma.exercise.findMany({
    where: { createdByUserId: null, name: { notIn: [...keepNames] } },
    select: { id: true },
  });
  let removed = 0;
  let kept = 0;
  for (const ex of stale) {
    const [sets, plans, clones] = await Promise.all([
      prisma.sessionSet.count({ where: { exerciseId: ex.id } }),
      prisma.workoutPlanExercise.count({ where: { exerciseId: ex.id } }),
      prisma.exercise.count({ where: { clonedFromId: ex.id } }),
    ]);
    if (sets + plans + clones === 0) {
      await prisma.exercise.delete({ where: { id: ex.id } });
      removed++;
    } else {
      kept++;
    }
  }

  console.log(
    `✓ Catálogo PT (auto): ${created} criados, ${updated} atualizados; ` +
      `${removed} antigos removidos, ${kept} mantidos (em uso). Strings únicas traduzidas: ${cache.size}.`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Falhou:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
