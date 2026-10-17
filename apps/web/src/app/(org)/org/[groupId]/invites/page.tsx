'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Link2, Mail, Upload } from 'lucide-react';
import {
  ApiError,
  batchResultMessage,
  batchSkipLabel,
  inviteSummary,
  orgApi,
  parseInviteEmails,
  teamRoleLabel,
  type BatchInviteResult,
  type GrantableRole,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

function Secao({
  id,
  titulo,
  icone: Icone,
  children,
}: {
  id: string;
  titulo: string;
  icone: typeof Link2;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
    >
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <Icone size={16} aria-hidden /> {titulo}
      </h2>
      {children}
    </section>
  );
}

function PapelSelect({
  id,
  value,
  onChange,
  papeis,
}: {
  id: string;
  value: GrantableRole;
  onChange: (r: GrantableRole) => void;
  papeis: GrantableRole[];
}) {
  // O profissional só convida membros: um seletor de uma opção só seria ruído.
  if (papeis.length === 1) {
    return (
      <p id={id} className="flex h-11 items-center text-sm text-muted-foreground">
        {teamRoleLabel(papeis[0]!)}
      </p>
    );
  }
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GrantableRole)}>
      <SelectTrigger id={id} className="h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {papeis.map((r) => (
          <SelectItem key={r} value={r}>
            {teamRoleLabel(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Convites: link para compartilhar, por e-mail, em lote e os que ainda valem.
 * O profissional convida só membros; quem define a equipe é o dono.
 */
export default function OrgInvitesPage() {
  const g = useOrgGroup();
  const papeis: GrantableRole[] = g.role === 'OWNER' ? PAPEIS : ['MEMBER'];
  const qc = useQueryClient();
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.invites(g.id) });

  const [papelLink, setPapelLink] = useState<GrantableRole>('MEMBER');
  const [usos, setUsos] = useState('');
  const [dias, setDias] = useState('7');
  const [link, setLink] = useState<string | null>(null);

  const [papelEmail, setPapelEmail] = useState<GrantableRole>('MEMBER');
  const [email, setEmail] = useState('');

  const [lote, setLote] = useState('');
  const [resultado, setResultado] = useState<BatchInviteResult | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const lidos = parseInviteEmails(lote);

  const convites = useQuery({
    queryKey: orgKeys.invites(g.id),
    queryFn: () => orgApi.invites(g.id),
  });

  const criarLink = useMutation({
    mutationFn: () =>
      orgApi.createInvite(g.id, {
        role: papelLink,
        ...(usos ? { maxUses: Number(usos) } : {}),
        expiresInDays: Number(dias),
      }),
    onSuccess: (r) => {
      setLink(r.url);
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para criar o link agora.')),
  });
  const convidarEmail = useMutation({
    mutationFn: () => orgApi.createInvite(g.id, { role: papelEmail, email: email.trim() }),
    onSuccess: (r) => {
      toast(
        r.emailSent
          ? `Convite enviado para ${email.trim()}.`
          : 'Convite criado, mas o e-mail não saiu. Reenvie pela lista.',
      );
      setEmail('');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para convidar agora.')),
  });
  const convidarLote = useMutation({
    mutationFn: () => orgApi.createInviteBatch(g.id, { role: 'MEMBER', emails: lidos.valid }),
    onSuccess: (r) => {
      setResultado(r);
      toast(batchResultMessage(r.created.length, r.skipped.length));
      setLote('');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para enviar o lote agora.')),
  });
  const reenviar = useMutation({
    mutationFn: (id: string) => orgApi.resendInvite(g.id, id),
    onSuccess: () => {
      toast('Convite reenviado. O link anterior deixou de valer.');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para reenviar agora.')),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => orgApi.revokeInvite(g.id, id),
    onSuccess: () => {
      toast('Convite revogado.');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para revogar agora.')),
  });

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado.');
    } catch {
      toast('Não deu para copiar. Selecione o link e copie.');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao id="link" titulo="Link de convite" icone={Link2}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="papel-link">Entra como</Label>
            <PapelSelect
              id="papel-link"
              value={papelLink}
              onChange={setPapelLink}
              papeis={papeis}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="usos">Limite de usos</Label>
            <Input
              id="usos"
              inputMode="numeric"
              placeholder="Sem limite"
              value={usos}
              onChange={(e) => setUsos(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dias">Vale por (dias)</Label>
            <Input
              id="dias"
              inputMode="numeric"
              value={dias}
              onChange={(e) => setDias(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </div>
        </div>
        <Button
          disabled={criarLink.isPending || !dias || Number(dias) < 1 || Number(dias) > 30}
          onClick={() => criarLink.mutate()}
        >
          {criarLink.isPending ? 'Criando...' : 'Criar link'}
        </Button>
        {link && (
          <div className="space-y-2 rounded-xl bg-muted/50 p-3">
            <p className="break-all font-mono text-xs" data-testid="invite-url">
              {link}
            </p>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => copiar(link)}>
              <Copy size={14} aria-hidden /> Copiar link
            </Button>
            <p className="text-xs text-muted-foreground">
              O link aparece só agora. Se perder, crie outro e revogue este na lista.
            </p>
          </div>
        )}
      </Secao>

      <Secao id="email" titulo="Convidar por e-mail" icone={Mail}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            convidarEmail.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="email-convite">E-mail</Label>
            <Input
              id="email-convite"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="papel-email">Entra como</Label>
            <PapelSelect
              id="papel-email"
              value={papelEmail}
              onChange={setPapelEmail}
              papeis={papeis}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Só a conta com este e-mail aceita, uma vez. O e-mail some 30 dias depois do uso ou do
            vencimento.
          </p>
          <Button type="submit" disabled={convidarEmail.isPending || !email.includes('@')}>
            {convidarEmail.isPending ? 'Enviando...' : 'Enviar convite'}
          </Button>
        </form>
      </Secao>

      <Secao id="lote" titulo="Convidar em lote" icone={Upload}>
        <div className="space-y-1">
          <Label htmlFor="lote-emails">E-mails (um por linha, ou cole a coluna da planilha)</Label>
          <Textarea
            id="lote-emails"
            rows={5}
            value={lote}
            onChange={(e) => {
              setLote(e.target.value);
              setResultado(null);
            }}
          />
        </div>
        <input
          ref={arquivo}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          aria-label="Escolher arquivo CSV"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setLote(await f.text());
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1" onClick={() => arquivo.current?.click()}>
            <Upload size={14} aria-hidden /> Subir .csv
          </Button>
          <Button
            disabled={convidarLote.isPending || lidos.valid.length === 0}
            onClick={() => convidarLote.mutate()}
          >
            {convidarLote.isPending
              ? 'Enviando...'
              : `Convidar ${lidos.valid.length} ${lidos.valid.length === 1 ? 'pessoa' : 'pessoas'}`}
          </Button>
        </div>
        {lote.trim() && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {[
              `${lidos.valid.length} válidos`,
              lidos.invalid.length ? `${lidos.invalid.length} inválidos` : null,
              lidos.duplicates.length ? `${lidos.duplicates.length} repetidos` : null,
              lidos.overLimit.length ? `${lidos.overLimit.length} além do limite de 50` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Em lote, todos entram como membro.</p>
        {resultado && resultado.skipped.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold">Pulados</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {resultado.skipped.map((s) => (
                <li key={`${s.email}-${s.reason}`}>
                  {s.email}: {batchSkipLabel(s.reason)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Secao>

      <section aria-labelledby="abertos" className="space-y-2 lg:col-span-2">
        <h2 id="abertos" className="text-sm font-semibold">
          Convites que ainda valem
        </h2>
        {convites.isPending && <Skeleton className="h-24 rounded-2xl bg-card" />}
        {convites.data && convites.data.length === 0 && (
          <EmptyState title="Nenhum convite aberto" />
        )}
        {convites.data && convites.data.length > 0 && (
          <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
            {convites.data.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inviteSummary(c)}</p>
                  <p className="text-xs text-muted-foreground">{teamRoleLabel(c.role)}</p>
                </div>
                <div className="flex gap-2">
                  {c.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reenviar.isPending}
                      onClick={() => reenviar.mutate(c.id)}
                    >
                      Reenviar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={revogar.isPending}
                    onClick={() => revogar.mutate(c.id)}
                  >
                    Revogar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
