/**
 * Seed da Tabela TACO (Tabela Brasileira de Composição de Alimentos).
 *
 * Lê `prisma/data/taco.csv` (UTF-8, exportado da planilha NEPA/Unicamp).
 * Estrutura:
 *   - 3 linhas de cabeçalho no topo
 *   - Linhas de grupo: col0 = nome do grupo, col1 vazia (sem número)
 *   - Linhas de cabeçalho repetidas a cada ~30 linhas (paginação)
 *   - Linhas de alimento: col0 = id numérico, col1 = descrição
 *   - "NA" e "Tr" em colunas numéricas → tratados como 0
 *
 * Idempotente: chave (name, source=TACO, createdByUserId=null).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, FoodSource } from '@prisma/client';

const prisma = new PrismaClient();

interface TacoFood {
  name: string;
  group: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

// Índices das colunas no CSV TACO (0-based)
const COL = {
  id: 0,
  description: 1,
  kcal: 3,
  protein: 5,
  fat: 6,
  carbs: 8,
};

/** CSV parser minimalista com suporte a campos entre aspas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseNumeric(value: string | undefined): number {
  if (!value) return 0;
  const v = value.trim();
  if (v === '' || v === 'NA' || v === 'Tr' || v === '*') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isFoodRow(row: string[]): boolean {
  const id = row[COL.id]?.trim() ?? '';
  return /^\d+$/.test(id);
}

function isGroupRow(row: string[]): boolean {
  const c0 = row[COL.id]?.trim() ?? '';
  const c1 = row[COL.description]?.trim() ?? '';
  if (!c0 || c1) return false;
  if (/^\d+$/.test(c0)) return false;
  if (c0 === 'Número do' || c0 === 'Alimento' || c0.startsWith('*')) return false;
  return true;
}

function readTacoFoods(csvPath: string): TacoFood[] {
  const text = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(text);
  const foods: TacoFood[] = [];
  let currentGroup = '';

  for (const row of rows) {
    if (row.length < 9) continue;
    if (isGroupRow(row)) {
      currentGroup = row[COL.id].trim();
      continue;
    }
    if (!isFoodRow(row)) continue;
    if (!currentGroup) continue;

    const name = row[COL.description].trim();
    if (!name) continue;

    foods.push({
      name,
      group: currentGroup,
      kcalPer100g: round2(parseNumeric(row[COL.kcal])),
      proteinPer100g: round2(parseNumeric(row[COL.protein])),
      carbsPer100g: round2(parseNumeric(row[COL.carbs])),
      fatPer100g: round2(parseNumeric(row[COL.fat])),
    });
  }
  return foods;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runSeedTaco() {
  const csvPath = resolve(__dirname, 'data', 'taco.csv');
  const foods = readTacoFoods(csvPath);
  if (foods.length === 0) {
    throw new Error(`Nenhum alimento lido de ${csvPath}`);
  }

  // 1. Garante grupos (apenas os efetivamente usados por algum alimento)
  const groupNames = Array.from(new Set(foods.map((f) => f.group)));
  for (const name of groupNames) {
    await prisma.foodGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  const groups = await prisma.foodGroup.findMany({
    where: { name: { in: groupNames } },
  });
  const groupByName = new Map(groups.map((g) => [g.name, g.id]));

  // 2. Upsert de alimentos (chave composta com null em createdByUserId não tem unique no schema)
  let created = 0;
  let updated = 0;
  for (const food of foods) {
    const groupId = groupByName.get(food.group);
    const existing = await prisma.food.findFirst({
      where: { name: food.name, source: FoodSource.TACO, createdByUserId: null },
    });
    if (existing) {
      await prisma.food.update({
        where: { id: existing.id },
        data: {
          kcalPer100g: food.kcalPer100g,
          proteinPer100g: food.proteinPer100g,
          carbsPer100g: food.carbsPer100g,
          fatPer100g: food.fatPer100g,
          groupId,
        },
      });
      updated++;
    } else {
      await prisma.food.create({
        data: {
          name: food.name,
          source: FoodSource.TACO,
          groupId,
          kcalPer100g: food.kcalPer100g,
          proteinPer100g: food.proteinPer100g,
          carbsPer100g: food.carbsPer100g,
          fatPer100g: food.fatPer100g,
        },
      });
      created++;
    }
  }

  console.log(
    `  ✓ TACO: ${created} criados, ${updated} atualizados (${foods.length} total, ${groupNames.length} grupos)`,
  );
}

if (require.main === module) {
  runSeedTaco()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
