import { oneClickUnsubscribe } from '@/lib/announcement-subscription';

/**
 * `POST /api/descadastro?t=…` (#398): o descadastro em um clique que o provedor
 * de e-mail faz pelo cabeçalho `List-Unsubscribe-Post` (RFC 8058). Sem login:
 * o token assinado vai para a API, que só desliga o e-mail daquele token
 * (comunicados, #398, ou relatório mensal, #400).
 */
export async function POST(req: Request): Promise<Response> {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  const corpo = await req.text().catch(() => '');
  if (new URLSearchParams(corpo).get('List-Unsubscribe') !== 'One-Click') {
    return new Response('Corpo de um clique ausente', { status: 400 });
  }
  return (await oneClickUnsubscribe(t))
    ? new Response('Descadastrado', { status: 200 })
    : new Response('Não deu agora', { status: 502 });
}
