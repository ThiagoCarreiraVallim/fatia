'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DELETE_ACCOUNT_CONFIRMATION,
  groupsApi,
  isDeleteConfirmed,
  usersApi,
} from '@fatia/api-client';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useExportData } from './use-export-data';

/**
 * Apagar conta (prancha Al-V8): o que se perde, exportar antes, o aviso da
 * loja e a palavra APAGAR. O botão só acende com a palavra (caixa e espaço
 * não importam, como na prancha); a API confere de novo.
 *
 * Serve a `/you/delete` e à página pública `/apagar-conta`, que as lojas pedem
 * como caminho fora do app. `cancelHref` é para onde "Cancelar" volta.
 */
export function DeleteAccountScreen({ cancelHref = '/you' }: { cancelHref?: string }) {
  const [typed, setTyped] = useState('');
  const qc = useQueryClient();
  const exportData = useExportData();
  // A conta dona de comunidade leva a comunidade junto: avisar antes.
  const groups = useQuery({ queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() });
  const owned = (groups.data ?? []).filter((g) => g.role === 'OWNER').map((g) => g.name);

  const remove = useMutation({
    mutationFn: () => usersApi.deleteMe(DELETE_ACCOUNT_CONFIRMATION),
    onSuccess: () => {
      // O cache guarda os dados da conta que acabou de deixar de existir.
      qc.clear();
      window.location.assign('/api/logto/sign-out');
    },
  });

  const ok = isDeleteConfirmed(typed);

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 pb-8 pt-4">
      <span className="mt-2 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[hsl(var(--danger)/0.14)] text-danger">
        <Icon name="trash" size={28} />
      </span>
      <h1 className="font-display text-[28px] font-bold leading-tight text-foreground">
        Apagar tudo?
      </h1>
      <p className="text-[15px] text-muted-foreground">
        Refeições, treinos, pesos, passos, metas e conversas com a IA. Não dá para recuperar.
      </p>

      <button
        type="button"
        onClick={() => exportData.mutate()}
        disabled={exportData.isPending}
        className="flex items-center gap-3 rounded-card bg-card p-4 text-left disabled:opacity-60"
      >
        <Icon name="download" size={20} className="shrink-0 text-primary" />
        <span className="flex-1 text-[15px] text-foreground">
          {exportData.isPending ? 'Preparando arquivo…' : 'Exportar uma cópia antes'}
        </span>
        <Icon name="chevR" size={18} className="shrink-0 text-muted-foreground" />
      </button>

      <Banner tone="warning" title="PRO assinado na loja: cancele na App Store ou Google Play.">
        Assinatura feita aqui na web é cancelada junto.
      </Banner>

      {owned.length > 0 && (
        <Banner tone="danger" title={`Esta conta é a dona de ${owned.join(', ')}`}>
          A comunidade é apagada junto, com a cobrança dos assentos. Para mantê-la, transfira a
          outra pessoa da equipe antes.
        </Banner>
      )}

      <p className="text-[13px] text-muted-foreground">
        Sem o app? Também dá para pedir pela web, em fat.ia.br/apagar-conta.
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirmar-exclusao"
          className="text-[13px] font-semibold text-muted-foreground"
        >
          Digite {DELETE_ACCOUNT_CONFIRMATION} para confirmar
        </label>
        <input
          id="confirmar-exclusao"
          className="h-12 w-full rounded-field bg-card px-3.5 text-[15px] uppercase text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={DELETE_ACCOUNT_CONFIRMATION}
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>

      <div className="flex-1" />

      {remove.error && (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      )}
      <Button
        size="xl"
        full
        className="bg-danger text-white hover:bg-danger/90"
        disabled={!ok || remove.isPending}
        onClick={() => remove.mutate()}
      >
        {remove.isPending ? 'Apagando…' : 'Apagar minha conta'}
      </Button>
      <Button asChild variant="text" size="xl" full className="-mt-1.5">
        <Link href={cancelHref}>Cancelar</Link>
      </Button>
    </div>
  );
}
