'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Download, Link2, Upload, Users } from 'lucide-react';
import {
  ApiError,
  accompanyOptions,
  batchResultMessage,
  batchSkipLabel,
  inviteValidityNote,
  orgApi,
  parseInviteEmails,
  parsedEmailsSummary,
  seatsApi,
  teamRoleLabel,
  whatsappHref,
  whatsappInviteMessage,
  type BatchInviteResult,
  type CreateInviteInput,
  type GrantableRole,
  type InviteOrigin,
  type MyGroup,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { InviteQr, qrSvgMarkup } from './invite-qr';
import { usePanelMembers } from './use-panel-members';

export type InviteMode = 'link' | 'email';

const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

/** As origens do link, com o nome sugerido (que a equipe pode trocar). */
const ORIGENS: { origin: InviteOrigin; name: string }[] = [
  { origin: 'QR', name: 'Recepção' },
  { origin: 'INSTAGRAM', name: 'Instagram' },
  { origin: 'REFERRAL', name: 'Indicação' },
  { origin: 'SITE', name: 'Site' },
  { origin: 'OTHER', name: 'Outro' },
];

const LIMITES = [
  { label: '1', value: 1 },
  { label: '50', value: 50 },
  { label: 'Sem limite', value: null },
] as const;

const VALIDADES = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: 'Sem prazo', days: null },
] as const;

const ROLE_HINT: Record<GrantableRole, string> = {
  MEMBER: 'Usa o app como aluno e entra nos desafios e no mural.',
  PROFESSIONAL: 'Acompanha alunos e envia planos. Vê só o que cada aluno autoriza.',
  CREATOR: 'Cria planos e dicas da comunidade, sem acesso a alunos.',
};

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast('Não deu para copiar. Selecione o texto e copie.');
  }
}

function downloadQr(url: string, name: string) {
  const blob = new Blob([qrSvgMarkup(url)], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `convite-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'link'}.svg`;
  a.click();
  URL.revokeObjectURL(href);
}

function Campo({
  titulo,
  children,
  nota,
}: {
  titulo: string;
  children: React.ReactNode;
  nota?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </legend>
      {children}
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </fieldset>
  );
}

/**
 * Convidar (Pn-04c e Pn-06b): link com origem e QR, ou e-mail em lote. Abre no
 * painel lateral de Membros, Convites e Ativação pendente. Quem entra por
 * convite pula a aprovação; o e-mail vence em 30 dias e o link pode não ter prazo.
 */
export function InvitePanel({
  group: g,
  initialMode = 'link',
  onDone,
}: {
  group: MyGroup;
  initialMode?: InviteMode;
  onDone: () => void;
}) {
  const dono = g.role === 'OWNER';
  const papeis: GrantableRole[] = dono ? PAPEIS : ['MEMBER'];
  const qc = useQueryClient();
  const [modo, setModo] = useState<InviteMode>(initialMode);

  const [origem, setOrigem] = useState(0);
  const [nome, setNome] = useState(ORIGENS[0]!.name);
  const [limite, setLimite] = useState(2);
  const [validade, setValidade] = useState(1);
  const [papel, setPapel] = useState<GrantableRole>('MEMBER');
  const [acompanha, setAcompanha] = useState<string | null>(null);
  const [assento, setAssento] = useState(false);
  const [criado, setCriado] = useState<{ url: string; name: string } | null>(null);

  const [lote, setLote] = useState('');
  const [resultado, setResultado] = useState<BatchInviteResult | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const lidos = parseInviteEmails(lote);

  const membros = usePanelMembers(g.id);
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });
  const livres = assentos.data?.pool
    ? Math.max(0, assentos.data.pool.seats - assentos.data.assigned)
    : 0;

  // O profissional só se põe como acompanhante (a API recusa outro nome).
  const acompanhantes: { id: string; label: string }[] = dono
    ? accompanyOptions(membros.data ?? []).map((m) => ({ id: m.membershipId, label: m.name }))
    : [{ id: g.membershipId, label: 'Eu' }];
  const ehMembro = papel === 'MEMBER';
  // Convite de equipe dá permissão de equipe: sempre com prazo (até 30 dias) e limite.
  const limites: readonly (typeof LIMITES)[number][] = ehMembro
    ? LIMITES
    : LIMITES.filter((l) => l.value !== null);
  const validades: readonly (typeof VALIDADES)[number][] = ehMembro
    ? VALIDADES
    : VALIDADES.filter((v) => v.days !== null);
  // Sem a opção "sem": o limite cai para 1 uso, e a validade para 30 dias.
  const limiteEscolhido = limites.includes(LIMITES[limite]!) ? LIMITES[limite]! : limites[0]!;
  const validadeEscolhida = validades.includes(VALIDADES[validade]!)
    ? VALIDADES[validade]!
    : validades[validades.length - 1]!;

  const extras = (): Pick<CreateInviteInput, 'accompaniedByMembershipId' | 'giveSeat'> => ({
    ...(ehMembro && acompanha ? { accompaniedByMembershipId: acompanha } : {}),
    ...(ehMembro && dono && assento ? { giveSeat: true } : {}),
  });

  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });

  const criarLink = useMutation({
    mutationFn: () => {
      const lim = limiteEscolhido.value;
      const dias = validadeEscolhida.days;
      return orgApi.createInvite(g.id, {
        role: papel,
        ...(nome.trim() ? { label: nome.trim() } : {}),
        origin: ORIGENS[origem]!.origin,
        ...(lim !== null ? { maxUses: lim } : {}),
        ...(dias === null ? { noExpiry: true } : { expiresInDays: dias }),
        ...extras(),
      });
    },
    onSuccess: (r) => {
      setCriado({ url: r.url, name: nome.trim() || 'Link' });
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para criar o link agora.')),
  });

  const convidarLote = useMutation({
    mutationFn: () =>
      orgApi.createInviteBatch(g.id, { role: papel, emails: lidos.valid, ...extras() }),
    onSuccess: (r) => {
      setResultado(r);
      toast(batchResultMessage(r.created.length, r.skipped.length));
      setLote('');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para enviar os convites agora.')),
  });

  const n = lidos.valid.length;
  const mensagem = criado ? whatsappInviteMessage(g.name, criado.url) : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <Campo titulo="Como convidar">
          <Segmented
            label="Como convidar"
            value={modo}
            onChange={(v) => {
              setModo(v);
              setCriado(null);
              setResultado(null);
            }}
            options={[
              { value: 'link', label: 'Link e QR' },
              { value: 'email', label: 'E-mail ou lote' },
            ]}
          />
        </Campo>

        {modo === 'link' && !criado && (
          <>
            <Campo
              titulo="Origem"
              nota="A origem aparece em Membros (“Entrou por”) e em Convites. Só a equipe vê o nome."
            >
              <div className="flex flex-wrap gap-2">
                {ORIGENS.map((o, i) => (
                  <Chip
                    key={o.origin}
                    selected={origem === i}
                    onClick={() => {
                      // O nome acompanha a origem enquanto a equipe não escreveu outro.
                      if (nome === ORIGENS[origem]!.name || !nome.trim()) setNome(o.name);
                      setOrigem(i);
                    }}
                  >
                    {o.name}
                  </Chip>
                ))}
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-label">Nome do link</Label>
                <Input
                  id="invite-label"
                  maxLength={60}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
            </Campo>
            <Campo titulo="Limite de usos">
              <div className="flex flex-wrap gap-2">
                {limites.map((l) => (
                  <Chip
                    key={l.label}
                    selected={limiteEscolhido === l}
                    onClick={() => setLimite(LIMITES.indexOf(l))}
                  >
                    {l.label}
                  </Chip>
                ))}
              </div>
            </Campo>
            <Campo
              titulo="Vale por"
              nota={
                ehMembro
                  ? inviteValidityNote('link')
                  : 'Convite de equipe vence em até 30 dias e tem limite de usos.'
              }
            >
              <div className="flex flex-wrap gap-2">
                {validades.map((v) => (
                  <Chip
                    key={v.label}
                    selected={validadeEscolhida === v}
                    onClick={() => setValidade(VALIDADES.indexOf(v))}
                  >
                    {v.label}
                  </Chip>
                ))}
              </div>
            </Campo>
          </>
        )}

        {modo === 'link' && criado && (
          <section aria-label="Link criado" className="space-y-3">
            <div className="flex justify-center">
              <InviteQr url={criado.url} />
            </div>
            <p
              className="break-all rounded-xl bg-muted/50 p-3 font-mono text-xs"
              data-testid="invite-url"
            >
              {criado.url}
            </p>
            <p className="text-xs text-muted-foreground">
              Imprima o QR para a {criado.name.toLowerCase()} ou mostre na tela.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => copy(criado.url, 'Link copiado.')}
              >
                <Copy size={14} aria-hidden /> Copiar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => downloadQr(criado.url, criado.name)}
              >
                <Download size={14} aria-hidden /> Baixar QR
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={whatsappHref(mensagem)} target="_blank" rel="noopener noreferrer">
                  Enviar no WhatsApp
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(mensagem, 'Mensagem copiada. Cole no WhatsApp.')}
              >
                Copiar mensagem
              </Button>
            </div>
            <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">“{mensagem}”</p>
          </section>
        )}

        {modo === 'email' && (
          <Campo titulo="E-mails" nota={inviteValidityNote('email')}>
            <Label htmlFor="invite-emails" className="sr-only">
              E-mails
            </Label>
            <Textarea
              id="invite-emails"
              rows={5}
              placeholder={'carla@email.com\ndiego@email.com'}
              value={lote}
              onChange={(e) => {
                setLote(e.target.value);
                setResultado(null);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => arquivo.current?.click()}
              >
                <Upload size={14} aria-hidden /> Subir .csv
              </Button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {lote.trim()
                  ? parsedEmailsSummary(lidos)
                  : 'um por linha, ou cole a coluna da planilha'}
              </span>
            </div>
            {resultado && resultado.skipped.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {resultado.skipped.map((s) => (
                  <li key={`${s.email}-${s.reason}`}>
                    {s.email}: {batchSkipLabel(s.reason)}
                  </li>
                ))}
              </ul>
            )}
          </Campo>
        )}

        {!criado && (
          <>
            <Campo titulo="Entra como" nota={ROLE_HINT[papel]}>
              {papeis.length === 1 ? (
                <p className="text-sm">{teamRoleLabel('MEMBER')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {papeis.map((r) => (
                    <Chip key={r} selected={papel === r} onClick={() => setPapel(r)}>
                      {teamRoleLabel(r)}
                    </Chip>
                  ))}
                </div>
              )}
            </Campo>

            {ehMembro && (
              <Campo titulo="Acompanhado por">
                <div className="flex flex-wrap gap-2">
                  {acompanhantes.map((a) => (
                    <Chip
                      key={a.id}
                      selected={acompanha === a.id}
                      onClick={() => setAcompanha(a.id)}
                    >
                      {a.label}
                    </Chip>
                  ))}
                  <Chip selected={acompanha === null} onClick={() => setAcompanha(null)}>
                    Ninguém
                  </Chip>
                </div>
              </Campo>
            )}

            {ehMembro && dono && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Dar assento PRO</p>
                  <p className="text-xs text-muted-foreground">
                    {assento
                      ? `Cada pessoa que entrar usa 1 dos ${livres} assentos livres.`
                      : livres > 0
                        ? 'Entra no Free. Dá para liberar depois.'
                        : 'Sem assentos livres agora. Compre mais em Assentos e faturas.'}
                  </p>
                </div>
                <Switch
                  label="Dar assento PRO"
                  checked={assento}
                  disabled={!assento && livres === 0}
                  onCheckedChange={setAssento}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Quem entra por convite pula a aprovação. A pessoa escolhe no app o que compartilha com
              a comunidade.
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" className="flex-1" onClick={onDone}>
          {criado ? 'Fechar' : 'Cancelar'}
        </Button>
        {modo === 'link' && criado && (
          <Button variant="outline" className="flex-1 gap-1" onClick={() => setCriado(null)}>
            <Link2 size={14} aria-hidden /> Criar outro
          </Button>
        )}
        {modo === 'link' && !criado && (
          <Button
            className="flex-1"
            disabled={criarLink.isPending}
            onClick={() => criarLink.mutate()}
          >
            {criarLink.isPending ? 'Criando...' : 'Criar link'}
          </Button>
        )}
        {modo === 'email' && (
          <Button
            className="flex-1 gap-1"
            disabled={convidarLote.isPending || n === 0}
            onClick={() => convidarLote.mutate()}
          >
            <Users size={14} aria-hidden />
            {convidarLote.isPending
              ? 'Enviando...'
              : `Convidar ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}
          </Button>
        )}
      </div>
    </div>
  );
}
