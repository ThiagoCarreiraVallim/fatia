#!/usr/bin/env node
// Conferência do Mapa do redesign (#370): cada prancha do canvas precisa ter exatamente uma
// issue dona, isto é, uma linha na tabela "Pranchas do canvas" de uma das issues do redesign.
//
// Uso:
//   node scripts/check-canvas-map.mjs <caminho/do/canvas.json> [primeira=367] [última=418]
//
// Lê as issues com `gh issue view` (precisa do gh autenticado). Sai com código 1 se alguma
// prancha ficou sem dona ou com mais de uma, para poder rodar de novo antes do merge.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [canvasPath, firstArg = '367', lastArg = '418'] = process.argv.slice(2);
if (!canvasPath) {
  console.error('uso: node scripts/check-canvas-map.mjs <canvas.json> [primeira] [última]');
  process.exit(2);
}

const boards = Object.keys(JSON.parse(readFileSync(canvasPath, 'utf8')).boards).map((file) =>
  file.replace(/\.dc\.html$/, ''),
);

/** @type {Map<string, number[]>} */
const owners = new Map();
for (let number = Number(firstArg); number <= Number(lastArg); number++) {
  const body = execFileSync(
    'gh',
    ['issue', 'view', String(number), '--json', 'body', '-q', '.body'],
    {
      encoding: 'utf8',
    },
  );
  // Só a tabela da seção "Pranchas do canvas" conta: a mesma prancha citada em prosa
  // (dependência, sobra de outra issue) não a torna dona.
  const section = /## Pranchas do canvas([\s\S]*?)(?=\n## |$)/.exec(body)?.[1] ?? '';
  for (const line of section.split('\n')) {
    const name = /^\|\s*`([^`]+)`/.exec(line)?.[1];
    if (name) owners.set(name, [...(owners.get(name) ?? []), number]);
  }
}

const withoutOwner = boards.filter((name) => !owners.has(name));
const withMany = boards.filter((name) => (owners.get(name)?.length ?? 0) > 1);
const unknown = [...owners.keys()].filter((name) => !boards.includes(name));

console.log(`pranchas no canvas: ${boards.length}`);
console.log(`com exatamente uma dona: ${boards.length - withoutOwner.length - withMany.length}`);
console.log(`sem dona: ${withoutOwner.length}`, withoutOwner);
console.log(
  `com mais de uma: ${withMany.length}`,
  withMany.map((name) => `${name} → #${owners.get(name).join(', #')}`),
);
console.log(`citadas numa issue e ausentes do canvas: ${unknown.length}`, unknown);

process.exit(withoutOwner.length || withMany.length ? 1 : 0);
