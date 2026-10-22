import type { InvitePreview } from '@fatia/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** O formato do token, o mesmo que a API confere: o resto nem vai à rede. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * O cartão do convite, buscado no servidor e sem token: quem abre o link ainda
 * pode não ter conta, e o proxy da web só fala com a API em nome de alguém
 * logado. A rota da API é pública e tem throttle próprio.
 *
 * Inválido, vencido, revogado, esgotado ou API fora do ar: `null`, e a tela
 * mostra a mesma mensagem para todos — o motivo não é dito a quem só tem o link.
 */
export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!TOKEN.test(token)) return null;
  try {
    const res = await fetch(`${API_BASE}/api/groups/invites/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as InvitePreview;
  } catch {
    return null;
  }
}
