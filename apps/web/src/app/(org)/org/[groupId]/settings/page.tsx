'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import {
  ApiError,
  contentApi,
  joinPolicyLabel,
  orgApi,
  panelHref,
  teamRoleLabel,
  type JoinPolicy,
  type ShareScope,
} from '@fatia/api-client';
import { RequiredScopesField } from '@/components/community/required-scopes-field';
import { ImageField } from '@/components/content/image-field';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const POLITICAS: JoinPolicy[] = ['OPEN', 'APPROVAL', 'INVITE_ONLY'];

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/**
 * Configurações da comunidade (só o dono): perfil, código de entrada, equipe,
 * passar a comunidade adiante e apagar.
 */
export default function OrgSettingsPage() {
  const g = useOrgGroup();
  const router = useRouter();
  const qc = useQueryClient();
  const [nome, setNome] = useState(g.name);
  const [descricao, setDescricao] = useState(g.description ?? '');
  const [politica, setPolitica] = useState<JoinPolicy>(g.joinPolicy);
  const [novoDono, setNovoDono] = useState('');
  const [transferindo, setTransferindo] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const equipe = (membros.data ?? []).filter((m) => m.status === 'ACTIVE' && m.role !== 'MEMBER');
  const candidatos = (membros.data ?? []).filter(
    (m) => m.status === 'ACTIVE' && m.role !== 'OWNER',
  );

  const salvar = useMutation({
    mutationFn: () =>
      orgApi.update(g.id, {
        name: nome.trim(),
        description: descricao.trim() || null,
        joinPolicy: politica,
      }),
    onSuccess: () => {
      toast('Comunidade atualizada.');
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });
  const transferir = useMutation({
    mutationFn: () => orgApi.transferOwner(g.id, novoDono),
    onSuccess: () => {
      toast('A comunidade tem outra pessoa como dona. Você segue na equipe como profissional.');
      setTransferindo(false);
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(panelHref(g.id));
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para transferir agora.')),
  });
  const apagar = useMutation({
    mutationFn: () => orgApi.remove(g.id),
    onSuccess: () => {
      toast(`${g.name} foi apagada.`);
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace('/community');
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status === 503
          ? 'Não conseguimos cancelar a cobrança dos assentos agora. Nada foi apagado; tente de novo em alguns minutos.'
          : apiErrorMessage(err, 'Não deu para apagar agora.'),
      ),
  });

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(g.slug);
      toast('Código copiado.');
    } catch {
      toast('Não deu para copiar.');
    }
  }

  const mudou =
    nome.trim() !== g.name ||
    (descricao.trim() || null) !== g.description ||
    politica !== g.joinPolicy;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <form
          aria-labelledby="perfil"
          className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <h2 id="perfil" className="text-sm font-semibold">
            Perfil
          </h2>
          <div className="space-y-1">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              maxLength={80}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              rows={3}
              maxLength={500}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="politica">Como se entra</Label>
            <Select value={politica} onValueChange={(v) => setPolitica(v as JoinPolicy)}>
              <SelectTrigger id="politica" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLITICAS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {joinPolicyLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={!mudou || nome.trim().length < 2 || salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>

        <RequiredScopesSection />
      </div>

      <div className="space-y-4">
        <AvatarSection />

        <section
          aria-labelledby="codigo"
          className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="codigo" className="text-sm font-semibold">
            Código de entrada
          </h2>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">{g.slug}</code>
            <Button size="sm" variant="outline" className="gap-1" onClick={copiarCodigo}>
              <Copy size={14} aria-hidden /> Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {g.joinPolicy === 'INVITE_ONLY'
              ? 'Com "Só por convite", o código não abre a porta: só os convites.'
              : 'Quem tiver o código pede para entrar em Comunidade › Entrar com código.'}
          </p>
        </section>

        <section
          aria-labelledby="equipe"
          className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="equipe" className="text-sm font-semibold">
            Equipe
          </h2>
          <ul className="space-y-1 text-sm">
            {equipe.map((m) => (
              <li key={m.membershipId} className="flex justify-between">
                <span>{m.name}</span>
                <span className="text-xs text-muted-foreground">{teamRoleLabel(m.role)}</span>
              </li>
            ))}
          </ul>
          <Link
            href={panelHref(g.id, 'members')}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Mudar papéis em Membros
          </Link>
        </section>

        <section
          aria-labelledby="perigo"
          className="space-y-3 rounded-2xl border border-danger/40 bg-card p-4"
        >
          <h2 id="perigo" className="text-sm font-semibold">
            Passar adiante ou apagar
          </h2>
          <div className="space-y-1">
            <Label htmlFor="novo-dono">Transferir para</Label>
            <Select value={novoDono} onValueChange={setNovoDono}>
              <SelectTrigger id="novo-dono" className="h-11">
                <SelectValue placeholder="Escolha alguém da comunidade" />
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((m) => (
                  <SelectItem key={m.membershipId} value={m.membershipId}>
                    {`${m.name} (${teamRoleLabel(m.role).toLowerCase()})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!novoDono} onClick={() => setTransferindo(true)}>
            Transferir
          </Button>
          <Button variant="ghost" className="w-full text-danger" onClick={() => setApagando(true)}>
            Apagar a comunidade
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={transferindo}
        onOpenChange={setTransferindo}
        title="Transferir a comunidade?"
        description={`${candidatos.find((m) => m.membershipId === novoDono)?.name ?? 'A pessoa'} passa a ser dona, com a cobrança dos assentos. Você continua na equipe como profissional.`}
        confirmLabel="Transferir"
        pendingLabel="Transferindo..."
        pending={transferir.isPending}
        onConfirm={() => transferir.mutate()}
      />

      <Dialog
        open={apagando}
        onOpenChange={(open) => {
          setApagando(open);
          if (!open) setConfirmacao('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar {g.name}?</DialogTitle>
            <DialogDescription>
              Saem os membros, os convites e o que cada um compartilhava com a equipe. Os assentos
              são cancelados no Asaas antes. Os registros de cada pessoa continuam com ela. Não dá
              para desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="confirma-nome">Digite o nome da comunidade para confirmar</Label>
            <Input
              id="confirma-nome"
              autoComplete="off"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setApagando(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmacao.trim() !== g.name || apagar.isPending}
              onClick={() => apagar.mutate()}
            >
              {apagar.isPending ? 'Apagando...' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * O que a comunidade exige. Seção à parte, com o próprio Salvar: mudar a
 * exigência tem consequência diferente de mudar o nome, e o aviso diz qual.
 */
function RequiredScopesSection() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [scopes, setScopes] = useState<ShareScope[]>(g.requiredSharingScopes);
  const save = useMutation({
    mutationFn: () => orgApi.update(g.id, { requiredSharingScopes: scopes }),
    onSuccess: () => {
      toast('Exigência atualizada.');
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });
  // `toggleScope` mantém a ordem canônica, e a API devolve na mesma: comparar
  // as listas juntas basta.
  const changed = scopes.join() !== g.requiredSharingScopes.join();

  return (
    <form
      aria-labelledby="obrigatorio"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 id="obrigatorio" className="text-sm font-semibold">
        Compartilhamento obrigatório
      </h2>
      <RequiredScopesField
        value={scopes}
        onChange={setScopes}
        hint="Vale para quem entrar daqui em diante. Quem já está dentro não passa a ser cobrado pelo que não compartilha; só não consegue tirar o que já compartilha e passou a ser obrigatório. A equipe não precisa."
      />
      <Button type="submit" disabled={!changed || save.isPending}>
        {save.isPending ? 'Salvando...' : 'Salvar exigência'}
      </Button>
    </form>
  );
}

/** O avatar da comunidade: aparece em Minhas comunidades e no detalhe dela. */
function AvatarSection() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const trocar = useMutation({
    mutationFn: (fileId: string | null) => contentApi.setAvatar(g.id, fileId),
    onSuccess: (_, fileId) => {
      toast(fileId ? 'Avatar atualizado.' : 'Avatar removido.');
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para trocar o avatar agora.')),
  });
  return (
    <section
      aria-labelledby="avatar"
      className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
    >
      <h2 id="avatar" className="text-sm font-semibold">
        Avatar
      </h2>
      <ImageField
        groupId={g.id}
        purpose="group_avatar"
        label="Imagem da comunidade"
        aspect="aspect-square max-w-32"
        value={g.avatarUrl ? { fileId: 'atual', url: g.avatarUrl } : null}
        onChange={(next) => trocar.mutate(next?.fileId ?? null)}
      />
    </section>
  );
}
