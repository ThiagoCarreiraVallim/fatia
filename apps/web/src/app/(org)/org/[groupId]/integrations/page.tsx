'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import {
  API_KEY_NAME_MAX,
  API_KEYS_HINT,
  ApiError,
  apiKeyDateLabel,
  apiKeyMask,
  apiKeyNameError,
  apiKeysApi,
  groupCan,
  INTEGRATION_RECIPES,
  quotaHint,
  quotaLabel,
  quotaPercent,
  quotaRenewsLabel,
  recipeSteps,
  type ApiKey,
  type ApiQuota,
  type CreatedApiKey,
  type IntegrationRecipe,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** A API como o Zapier e o Make a chamam (com o prefixo `/api` do Nest). */
const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api`;

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

const card = 'flex flex-col gap-3 rounded-card bg-card p-5 sm:p-[22px]';

/**
 * Integrações e API (#413, pranchas Pn-38 e Pn-38b): as chaves da comunidade
 * (o segredo aparece uma vez, na criação), a cota do mês e as receitas prontas
 * para Zapier e Make. Só o dono; a API confere de novo.
 */
export default function IntegrationsPage() {
  const g = useOrgGroup();
  const dono = groupCan(g, 'integration.manage');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-h3 font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Ligue o Fatia às ferramentas que vocês já usam.
        </p>
      </div>
      {dono ? (
        <IntegrationsBody groupId={g.id} />
      ) : (
        <EmptyState
          dsIcon="lock"
          title="Só o dono cuida das integrações."
          description="As chaves de API leem dados da comunidade inteira. Peça ao dono, se precisar de uma."
        />
      )}
    </div>
  );
}

function IntegrationsBody({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const view = useQuery({
    queryKey: orgKeys.apiKeys(groupId),
    queryFn: () => apiKeysApi.list(groupId),
  });
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState<CreatedApiKey | null>(null);
  const [revogar, setRevogar] = useState<ApiKey | null>(null);
  const [receita, setReceita] = useState<IntegrationRecipe | null>(null);

  const revoga = useMutation({
    mutationFn: (k: ApiKey) => apiKeysApi.revoke(groupId, k.id),
    onSuccess: () => {
      setRevogar(null);
      toast('Chave revogada');
      void qc.invalidateQueries({ queryKey: orgKeys.apiKeys(groupId) });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para revogar agora.')),
  });

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="chaves" className={card}>
          <h2 id="chaves" className="text-lg font-bold">
            Chaves de API
          </h2>
          {view.isPending ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : view.isError ? (
            <div className="flex flex-col items-start gap-2">
              <b>Não deu para carregar as chaves.</b>
              <Button size="xs" variant="secondary" onClick={() => void view.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : view.data.keys.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-xl bg-muted px-4 py-6 text-center">
              <b>Nenhuma chave</b>
              <span className="text-[13px] text-muted-foreground">
                Crie uma para ligar o Fatia ao Zapier, Make ou a sua planilha.
              </span>
            </div>
          ) : (
            <KeysTable keys={view.data.keys} onRevoke={setRevogar} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="xs" className="gap-1.5" onClick={() => setCriando(true)}>
              <Icon name="plus" size={16} /> Criar chave
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">{API_KEYS_HINT}</p>
        </section>

        {view.data ? (
          <QuotaCard quota={view.data.quota} />
        ) : (
          <Skeleton className="h-36 rounded-card" />
        )}
      </div>

      <section aria-labelledby="receitas" className="space-y-3">
        <h2 id="receitas" className="text-lg font-bold">
          Receitas prontas
        </h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {INTEGRATION_RECIPES.map((r) => (
            <li key={r.id} className={cn(card, 'gap-2')}>
              <span className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">
                {r.tool}
              </span>
              <b className="text-[15px]">{r.title}</b>
              <p className="flex-1 text-[13px] text-muted-foreground">{r.body}</p>
              <Button
                size="xs"
                variant="secondary"
                className="w-fit bg-muted hover:bg-surface-3"
                aria-label={`Usar receita: ${r.title}`}
                onClick={() => setReceita(r)}
              >
                Usar receita
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <CreateKeyDialog
        groupId={groupId}
        open={criando}
        onOpenChange={setCriando}
        onCreated={(c) => {
          setCriando(false);
          setCriada(c);
          void qc.invalidateQueries({ queryKey: orgKeys.apiKeys(groupId) });
        }}
      />
      <SecretDialog created={criada} onClose={() => setCriada(null)} />
      <ConfirmDialog
        open={revogar !== null}
        onOpenChange={(o) => !o && setRevogar(null)}
        title={`Revogar ${revogar?.name ?? 'a chave'}?`}
        description="As chamadas com esta chave param na hora. O que o Zapier ou o Make já leram continua lá; para voltar, crie outra chave."
        confirmLabel="Revogar"
        pendingLabel="Revogando..."
        pending={revoga.isPending}
        onConfirm={() => revogar && revoga.mutate(revogar)}
      />
      <RecipeDialog recipe={receita} onClose={() => setReceita(null)} />
    </>
  );
}

function KeysTable({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (k: ApiKey) => void }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table aria-label="Chaves de API" className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-1 pb-2 font-semibold">Nome</th>
            <th className="px-1 pb-2 font-semibold">Chave</th>
            <th className="px-1 pb-2 font-semibold">Criada</th>
            <th className="px-1 pb-2">
              <span className="sr-only">Revogar</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {keys.map((k) => (
            <tr key={k.id} className="h-12">
              <td className="px-1 font-semibold">{k.name}</td>
              <td className="px-1">
                <code className="font-mono text-[13px] text-muted-foreground">
                  {apiKeyMask(k.lastFour)}
                </code>
              </td>
              <td className="px-1 text-muted-foreground">{apiKeyDateLabel(k.createdAt)}</td>
              <td className="px-1 text-right">
                <Button
                  variant="text"
                  size="xs"
                  aria-label={`Revogar ${k.name}`}
                  onClick={() => onRevoke(k)}
                >
                  Revogar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A cota do mês (Pn-38); perto do fim, o aviso âmbar (Pn-38b). */
function QuotaCard({ quota }: { quota: ApiQuota }) {
  const pct = quotaPercent(quota);
  const alerta = quota.state !== 'ok';
  return (
    <section
      aria-labelledby="cota"
      className={cn(card, alerta && 'shadow-[inset_0_0_0_1px_hsl(var(--warning)/0.45)]')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cota" className="text-lg font-bold">
          Cota do mês
        </h2>
        <span className="text-[13px] text-muted-foreground">{quotaRenewsLabel(quota)}</span>
      </div>
      <b className="font-display text-2xl tabular-nums">{quotaLabel(quota)}</b>
      <div
        role="progressbar"
        aria-label="Cota do mês"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn('block h-full rounded-full', alerta ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-[13px]', alerta ? 'text-warning' : 'text-muted-foreground')}>
        {quotaHint(quota)}
      </p>
    </section>
  );
}

function CreateKeyDialog({
  groupId,
  open,
  onOpenChange,
  onCreated,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: CreatedApiKey) => void;
}) {
  const [nome, setNome] = useState('');
  const erro = nome ? apiKeyNameError(nome) : null;
  const cria = useMutation({
    mutationFn: () => apiKeysApi.create(groupId, { name: nome.trim() }),
    onSuccess: (c) => {
      setNome('');
      onCreated(c);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para criar a chave agora.')),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setNome('');
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar chave</DialogTitle>
          <DialogDescription>
            Um nome que você reconheça depois, como &quot;Zapier&quot; ou &quot;Planilha da
            recepção&quot;.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!apiKeyNameError(nome)) cria.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nome-chave">Nome da chave</Label>
            <Input
              id="nome-chave"
              autoComplete="off"
              maxLength={API_KEY_NAME_MAX + 10}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              error={erro ?? undefined}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={apiKeyNameError(nome) !== null || cria.isPending}>
              {cria.isPending ? 'Criando...' : 'Criar chave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** O segredo inteiro, uma vez: o banco guarda só o hash. */
function SecretDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}) {
  async function copiar() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      toast('Chave copiada');
    } catch {
      toast('Não deu para copiar. Selecione e copie à mão.');
    }
  }
  return (
    <Dialog open={created !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chave {created?.key.name} criada</DialogTitle>
          <DialogDescription>
            Copie agora e cole no Zapier ou no Make. Por segurança, ela não aparece de novo: se
            perder, revogue e crie outra.
          </DialogDescription>
        </DialogHeader>
        {created && (
          <div className="flex items-center gap-2 rounded-field bg-muted p-3">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px]">
              {created.secret}
            </code>
            <button
              type="button"
              aria-label="Copiar chave"
              onClick={() => void copiar()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-3"
            >
              <Copy size={16} aria-hidden />
            </button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Já copiei</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecipeDialog({
  recipe,
  onClose,
}: {
  recipe: IntegrationRecipe | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={recipe !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {recipe && (
          <>
            <DialogHeader>
              <DialogTitle>{recipe.title}</DialogTitle>
              <DialogDescription>{recipe.body}</DialogDescription>
            </DialogHeader>
            <ol aria-label="Passo a passo" className="list-decimal space-y-2 pl-5 text-sm">
              {recipeSteps(recipe, API_BASE).map((passo) => (
                <li key={passo} className="break-words">
                  {passo}
                </li>
              ))}
            </ol>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={onClose}>
                Fechar
              </Button>
              <Button asChild className="gap-1.5">
                <a href={recipe.url} target="_blank" rel="noreferrer">
                  Abrir o {recipe.tool} <ExternalLink size={14} aria-hidden />
                </a>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
