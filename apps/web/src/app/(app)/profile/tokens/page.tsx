'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { mcpTokensApi } from '@/lib/api/nutrition';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TokensPage() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['mcp-tokens'], queryFn: () => mcpTokensApi.list() });
  const [label, setLabel] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (l: string) => mcpTokensApi.create(l),
    onSuccess: (token) => {
      setPlaintext(token.plaintext);
      setLabel('');
      qc.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => mcpTokensApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-tokens'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    create.mutate(label.trim());
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Link href="/profile" className="rounded p-1 hover:bg-accent" aria-label="Voltar">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Tokens MCP</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Use estes tokens para autenticar o Claude (ou outro cliente MCP) contra a API.
      </p>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Claude Desktop"
          maxLength={80}
        />
        <Button type="submit" disabled={create.isPending}>
          Criar
        </Button>
      </form>

      {plaintext && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Copie agora — só será mostrado uma vez:</p>
          <code className="mt-2 block break-all rounded bg-background p-2 text-xs">
            {plaintext}
          </code>
          <button
            type="button"
            onClick={() => setPlaintext(null)}
            className="mt-2 text-xs underline"
          >
            ok, copiei
          </button>
        </div>
      )}

      <ul className="divide-y rounded-md border bg-card">
        {tokens.data?.map((t) => (
          <li key={t.id} className="flex items-center justify-between p-3">
            <div className="text-sm">
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">
                Criado em {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                {t.lastUsedAt &&
                  ` · Usado em ${new Date(t.lastUsedAt).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => revoke.mutate(t.id)}
              className="rounded p-1 text-muted-foreground hover:text-rose-500"
              aria-label="Revogar"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {tokens.data?.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">Nenhum token ativo.</li>
        )}
      </ul>

      {/* Claude configuration instructions */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-base">Como usar com o Claude</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <span>Crie um token MCP acima e copie-o.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              2
            </span>
            <span>
              Abra o <strong>Claude.ai</strong> → Configurações → Integrações → Adicionar servidor
              MCP.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              3
            </span>
            <div className="space-y-1">
              <p>URL do servidor:</p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                https://seu-dominio.com/mcp/sse
              </code>
              <p className="text-xs text-muted-foreground">
                (use <code className="rounded bg-muted px-1">http://localhost:3000/mcp/sse</code>{' '}
                para desenvolvimento local)
              </p>
            </div>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              4
            </span>
            <span>
              Autenticação: <strong>Bearer token</strong> → cole seu token MCP.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              5
            </span>
            <span>Salve e inicie uma conversa com Claude! 🎉</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
