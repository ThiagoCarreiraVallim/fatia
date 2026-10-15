'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, KeyRound, Trash2 } from 'lucide-react';
import { DELETE_ACCOUNT_CONFIRMATION, usersApi } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const rowClass =
  'flex w-full items-center gap-4 border-b border-subtle px-4 py-4 text-left last:border-b-0 disabled:opacity-60';

function RowIcon({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-xl ${danger ? 'bg-destructive/10' : 'bg-muted/60'}`}
    >
      {children}
    </div>
  );
}

function RowText({
  title,
  subtitle,
  danger = false,
}: {
  title: string;
  subtitle: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p
        className={`text-base font-bold leading-tight ${danger ? 'text-danger' : 'text-foreground'}`}
      >
        {title}
      </p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/**
 * Conta e segurança no PWA: trocar senha, exportar e apagar a conta.
 *
 * Antes só o app nativo tinha exportar/apagar (lojas exigem); no PWA o direito
 * existia só pelo endpoint e pelo MCP. Trocar senha reaproveita o "esqueci minha
 * senha" do Logto — código por e-mail e senha nova —, sem tela própria nem
 * senha passando pela nossa API.
 */
export function AccountSection() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const qc = useQueryClient();

  const exportData = useMutation({
    mutationFn: () => usersApi.exportMyData(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fatia-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: () => usersApi.deleteMe(confirmation.trim()),
    onSuccess: () => {
      // O cache guarda os dados da conta que acabou de deixar de existir.
      qc.clear();
      window.location.href = '/api/logto/sign-out';
    },
  });

  const canConfirm = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION;

  return (
    <section aria-labelledby="conta-e-seguranca" className="space-y-2">
      <h2
        id="conta-e-seguranca"
        className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        Conta e segurança
      </h2>
      <div className="overflow-hidden rounded-2xl border border-subtle bg-card">
        {/* prefetch={false}: o handler inicia o fluxo OAuth por redirect. */}
        <Link href="/api/logto/sign-in?tela=senha" prefetch={false} className={rowClass}>
          <RowIcon>
            <KeyRound size={18} className="text-primary" />
          </RowIcon>
          <RowText title="Trocar senha" subtitle="Enviamos um código para o seu e-mail" />
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
        <button
          type="button"
          className={rowClass}
          onClick={() => exportData.mutate()}
          disabled={exportData.isPending}
        >
          <RowIcon>
            <Download size={18} className="text-primary" />
          </RowIcon>
          <RowText
            title={exportData.isPending ? 'Preparando arquivo…' : 'Exportar meus dados'}
            subtitle={exportData.error?.message ?? 'Tudo o que você registrou, em um arquivo JSON'}
          />
        </button>
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            setConfirmation('');
            setDeleteOpen(true);
          }}
        >
          <RowIcon danger>
            <Trash2 size={18} className="text-danger" />
          </RowIcon>
          <RowText danger title="Apagar minha conta" subtitle="Remove a conta e todos os dados" />
        </button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar minha conta</DialogTitle>
            <DialogDescription>
              Isso remove sua conta e todos os dados: refeições, treinos, pesos, passos e metas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div role="alert" className="rounded-xl border border-danger bg-card p-3">
              <p className="text-sm font-bold text-danger">
                Ação irreversível. Não há como recuperar depois.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Se quiser guardar uma cópia, exporte seus dados antes.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-exclusao">
                Digite {DELETE_ACCOUNT_CONFIRMATION} para confirmar
              </Label>
              <Input
                id="confirmar-exclusao"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={DELETE_ACCOUNT_CONFIRMATION}
                autoComplete="off"
              />
            </div>
            {deleteAccount.error ? (
              <p className="text-sm text-danger">{deleteAccount.error.message}</p>
            ) : null}
            <Button
              variant="destructive"
              className="w-full"
              disabled={!canConfirm || deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              {deleteAccount.isPending ? 'Apagando…' : 'Apagar minha conta'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
