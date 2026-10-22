import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * A "Academia Demo" do seed (`seed-demo.ts`) e os scripts que mexem nela por
 * fora da tela: o convite por link e a limpeza do demo. Os fluxos e as fotos
 * entram por convite e saem pelo `--purge`, para o demo voltar ao estado do seed.
 */
export const COMMUNITY_SLUG = 'academia-demo';
export const COMMUNITY_NAME = 'Academia Demo';
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@fatia.local';
export const TEAM_EMAIL = process.env.EQUIPE_EMAIL ?? 'equipe@fatia.local';
export const TEAM_PASSWORD = process.env.EQUIPE_PASSWORD ?? 'Fatia-equipe-2026!';

const ROOT = resolve(__dirname, '../..');

function run(command: string): string {
  return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Um link de convite novo da Academia Demo, só o caminho (`/c/<token>`). */
export function newInvitePath(): string {
  const url = run(`pnpm -s community:invite ${COMMUNITY_SLUG}`).trim().split('\n').at(-1)!;
  return new URL(url).pathname;
}

/** Tira o demo da comunidade (vínculos, assento e convites de link junto). */
export function purgeDemo(): void {
  run(`pnpm -s billing:grant-seat ${DEMO_EMAIL} ${COMMUNITY_SLUG} --purge`);
  run(`pnpm -s community:invite ${COMMUNITY_SLUG} --purge ${DEMO_EMAIL}`);
}

export function grantSeatToDemo(): void {
  run(`pnpm -s billing:grant-seat ${DEMO_EMAIL} ${COMMUNITY_SLUG}`);
}
