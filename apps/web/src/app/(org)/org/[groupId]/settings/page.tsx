'use client';

import { useState, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Copy } from 'lucide-react';
import { checkBrandColor, type IconName } from '@fatia/design';
import {
  ApiError,
  COMMUNITY_SECTIONS,
  contentApi,
  GROUP_TYPE_OPTIONS,
  groupCan,
  IMAGE_MIMES,
  isSectionHidden,
  JOIN_POLICY_OPTIONS,
  MEAL_PHOTOS_LOCKED,
  orgApi,
  panelHref,
  REQUIRED_SCOPE_ITEMS,
  REQUIRED_SCOPES_HINT,
  SECTIONS_HINT,
  sectionSubtitle,
  sectionToast,
  teamRoleLabel,
  teamSummaryLabel,
  timezoneOptions,
  toggleScope,
  toggleSection,
  VISIBILITY_OPTIONS,
  type CommunitySection,
  type GroupRole,
  type GroupType,
  type JoinPolicy,
  type MyGroup,
  type PanelSection,
  type ShareScope,
  type UpdateGroupInput,
} from '@fatia/api-client';
import { GroupAvatar } from '@/components/community/group-avatar';
import { useImageUpload } from '@/components/content/image-field';
import { BrandColorField } from '@/components/org/brand-color-field';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented, Switch } from '@/components/ui/selection';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Visibility = 'PUBLIC' | 'PRIVATE';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.join() === b.join();

/** A cor que vai para a API: vazia volta à padrão; com aviso, o tom sugerido (Onb-C2). */
function brandToSave(value: string): { color: string | null; adjusted: boolean } | 'invalid' {
  if (!value.trim()) return { color: null, adjusted: false };
  const check = checkBrandColor(value);
  if (check.status === 'rejected') return 'invalid';
  if (check.status === 'warning') return { color: check.suggestion.toLowerCase(), adjusted: true };
  return { color: check.color.toLowerCase(), adjusted: false };
}

const card = 'flex flex-col gap-3 rounded-card bg-card p-5 sm:p-[22px]';

/**
 * Configurações da comunidade (#413, prancha Pn-15). Um "Salvar" no topo para
 * perfil, marca, acesso e o que o membro precisa compartilhar; as seções
 * salvam na hora (esconder nunca desliga nada do app do aluno). Mudar o tipo,
 * passar adiante e apagar são só do dono, e a API confere de novo.
 */
export default function OrgSettingsPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const podeTipo = groupCan(g, 'billing.manage');
  const podeExigir = groupCan(g, 'group.sharing');

  const [nome, setNome] = useState(g.name);
  const [descricao, setDescricao] = useState(g.description ?? '');
  const [fuso, setFuso] = useState(g.timezone);
  const [cor, setCor] = useState(g.brandColor ?? '');
  const [tipo, setTipo] = useState<GroupType>(g.type);
  const [visibilidade, setVisibilidade] = useState<Visibility>(g.visibility);
  const [politica, setPolitica] = useState<JoinPolicy>(g.joinPolicy);
  const [exigidos, setExigidos] = useState<ShareScope[]>(g.requiredSharingScopes);

  const marca = brandToSave(cor);
  const mudancas: UpdateGroupInput = {};
  if (nome.trim() !== g.name) mudancas.name = nome.trim();
  if ((descricao.trim() || null) !== g.description) mudancas.description = descricao.trim() || null;
  if (fuso !== g.timezone) mudancas.timezone = fuso;
  if (marca !== 'invalid' && marca.color !== (g.brandColor ?? null)) {
    mudancas.brandColor = marca.color;
  }
  if (podeTipo && tipo !== g.type) mudancas.type = tipo;
  if (visibilidade !== g.visibility) mudancas.visibility = visibilidade;
  if (politica !== g.joinPolicy) mudancas.joinPolicy = politica;
  if (podeExigir && !sameList(exigidos, g.requiredSharingScopes)) {
    mudancas.requiredSharingScopes = exigidos;
  }
  const mudou = Object.keys(mudancas).length > 0;
  const valido = nome.trim().length >= 2 && marca !== 'invalid';

  const salvar = useMutation({
    mutationFn: () => orgApi.update(g.id, mudancas),
    onSuccess: () => {
      if (marca !== 'invalid' && marca.adjusted && marca.color) {
        setCor(marca.color);
        toast(`Configurações salvas · usamos ${marca.color.toUpperCase()}, um pouco mais escura`);
      } else {
        toast('Configurações salvas');
      }
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-h3 font-bold">Configurações</h1>
          <p className="truncate text-sm text-muted-foreground">
            {g.name} · código {g.slug}
          </p>
        </div>
        <Button disabled={!mudou || !valido || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="perfil" className={card}>
          <h2 id="perfil" className="text-lg font-bold">
            Perfil
          </h2>
          <AvatarPicker />
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              maxLength={80}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              rows={2}
              maxLength={500}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <EntryCode slug={g.slug} />
            <div className="space-y-1.5">
              <Label htmlFor="fuso">Fuso horário</Label>
              <Select value={fuso} onValueChange={setFuso}>
                <SelectTrigger id="fuso" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions(g.timezone).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CoverPicker />
          <BrandColorField value={cor} onChange={setCor} />
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
            <span>
              A cor é testada com texto branco e escuro. Se nenhum passa 4,5:1, usamos um tom um
              pouco mais escuro ao salvar. Vazia, volta à cor padrão.
            </span>
          </p>
        </section>

        <section aria-labelledby="acesso" className={card}>
          <h2 id="acesso" className="text-lg font-bold">
            Acesso
          </h2>
          <div className="space-y-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Tipo</span>
            <Segmented
              label="Tipo"
              value={tipo}
              onChange={setTipo}
              options={GROUP_TYPE_OPTIONS.map((o) => ({ ...o, disabled: !podeTipo }))}
            />
            {!podeTipo && (
              <p className="text-[13px] text-muted-foreground">Só o dono muda o tipo.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Visibilidade</span>
            <Segmented
              label="Visibilidade"
              value={visibilidade}
              onChange={setVisibilidade}
              options={[...VISIBILITY_OPTIONS]}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Como se entra</span>
            <Segmented
              label="Como se entra"
              value={politica}
              onChange={setPolitica}
              options={JOIN_POLICY_OPTIONS.map(({ value, label }) => ({ value, label }))}
            />
            <p className="text-[13px] text-muted-foreground">
              {JOIN_POLICY_OPTIONS.find((o) => o.value === politica)?.hint}
            </p>
          </div>
        </section>

        <RequiredScopesCard value={exigidos} onChange={setExigidos} editable={podeExigir} />

        <SectionsCard />

        <MoreCard g={g} />

        <TeamCard />
      </div>
    </div>
  );
}

/** O código de entrada não muda: só copiar. */
function EntryCode({ slug }: { slug: string }) {
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(slug);
      toast('Código copiado.');
    } catch {
      toast('Não deu para copiar.');
    }
  }
  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-semibold text-muted-foreground">Código de entrada</span>
      <div className="flex h-11 items-center gap-2 rounded-field bg-muted pl-3.5 pr-1">
        <code className="min-w-0 flex-1 truncate text-sm">{slug}</code>
        <button
          type="button"
          aria-label="Copiar código"
          onClick={() => void copyCode()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-3 hover:text-foreground"
        >
          <Copy size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** O avatar (o logo) da comunidade: troca na hora, como antes. */
function AvatarPicker() {
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
  const { input, enviando, enviar, pick } = useImageUpload(g.id, 'group_avatar', (v) =>
    trocar.mutate(v.fileId),
  );
  return (
    <div className="flex items-center gap-3">
      <GroupAvatar name={g.name} url={g.avatarUrl} size={56} className="rounded-[18px]" />
      <Button
        variant="secondary"
        size="xs"
        className="gap-1.5 bg-muted hover:bg-surface-3"
        disabled={enviando || trocar.isPending}
        onClick={pick}
      >
        <Icon name="image" size={16} />
        {enviando ? 'Enviando…' : 'Trocar avatar'}
      </Button>
      {g.avatarUrl && (
        <Button variant="text" size="xs" onClick={() => trocar.mutate(null)}>
          Tirar
        </Button>
      )}
      <HiddenFileInput inputRef={input} onFile={enviar} label="Avatar da comunidade" />
    </div>
  );
}

/** A capa: a imagem no alto do convite e da comunidade. Troca na hora. */
function CoverPicker() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const trocar = useMutation({
    mutationFn: (fileId: string | null) => orgApi.setCover(g.id, fileId),
    onSuccess: (_, fileId) => {
      toast(fileId ? 'Capa atualizada.' : 'Capa removida.');
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para trocar a capa agora.')),
  });
  const { input, enviando, enviar, pick } = useImageUpload(g.id, 'group_cover', (v) =>
    trocar.mutate(v.fileId),
  );
  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-semibold text-muted-foreground">Capa</span>
      {g.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador
        <img src={g.coverUrl} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
      ) : (
        <div
          aria-hidden
          className="aspect-[3/1] w-full rounded-xl bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand)/0.45))]"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="xs"
          className="gap-1.5 bg-muted hover:bg-surface-3"
          disabled={enviando || trocar.isPending}
          onClick={pick}
        >
          <Icon name="image" size={16} />
          {enviando ? 'Enviando…' : g.coverUrl ? 'Trocar capa' : 'Escolher capa'}
        </Button>
        {g.coverUrl && (
          <Button variant="text" size="xs" onClick={() => trocar.mutate(null)}>
            Tirar capa
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Aparece no convite e no topo da comunidade. JPEG, PNG ou WebP até 10 MB.
      </p>
      <HiddenFileInput inputRef={input} onFile={enviar} label="Capa da comunidade" />
    </div>
  );
}

function HiddenFileInput({
  inputRef,
  onFile,
  label,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => Promise<void>;
  label: string;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      aria-label={label}
      accept={IMAGE_MIMES.join(',')}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void onFile(file);
      }}
    />
  );
}

/** "O que o membro precisa compartilhar": marcado = travado na entrada. */
function RequiredScopesCard({
  value,
  onChange,
  editable,
}: {
  value: ShareScope[];
  onChange: (next: ShareScope[]) => void;
  editable: boolean;
}) {
  return (
    <section role="group" aria-labelledby="exigido" className={cn(card, 'gap-2.5')}>
      <h2 id="exigido" className="text-lg font-bold">
        O que o membro precisa compartilhar
      </h2>
      <p className="text-[13px] text-muted-foreground">{REQUIRED_SCOPES_HINT}</p>
      {!editable && (
        <p className="text-[13px] text-muted-foreground">Só o dono muda o que é obrigatório.</p>
      )}
      <ul className="flex flex-col">
        {REQUIRED_SCOPE_ITEMS.map((item) => {
          const on = value.includes(item.scope);
          // A trava vale para marcar; a comunidade antiga que já marcou desmarca.
          const blocked = item.locked && !on;
          return (
            <li key={item.scope}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={!editable || blocked}
                onClick={() => {
                  if (blocked) return toast(MEAL_PHOTOS_LOCKED);
                  if (!editable) return;
                  onChange(toggleScope(value, item.scope));
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]',
                    on
                      ? 'bg-primary text-primary-foreground'
                      : 'shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]',
                    blocked && 'opacity-50',
                  )}
                >
                  {on && <Icon name="check" size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{item.label}</b>
                  <span className="block text-[13px] text-muted-foreground">{item.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * As seções da comunidade: cada interruptor salva na hora, com o toast que
 * lembra que nada some do app do aluno.
 */
function SectionsCard() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [ocultas, setOcultas] = useState<CommunitySection[]>(g.hiddenSections ?? []);
  const salvar = useMutation({
    mutationFn: (next: CommunitySection[]) => orgApi.update(g.id, { hiddenSections: next }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community'] }),
  });
  const pode = groupCan(g, 'group.update');

  function toggle(s: CommunitySection) {
    const antes = ocultas;
    const next = toggleSection(antes, s);
    const escondeu = next.includes(s);
    setOcultas(next);
    toast(sectionToast(s, escondeu));
    salvar.mutate(next, {
      onError: (err) => {
        setOcultas(antes);
        toast(apiErrorMessage(err, 'Não deu para salvar agora.'));
      },
    });
  }

  return (
    <section role="group" aria-labelledby="secoes" className={cn(card, 'gap-2.5')}>
      <h2 id="secoes" className="text-lg font-bold">
        Seções da comunidade
      </h2>
      <p className="text-[13px] text-muted-foreground">{SECTIONS_HINT}</p>
      <ul className="flex flex-col">
        {COMMUNITY_SECTIONS.map((s) => {
          const escondida = isSectionHidden({ hiddenSections: ocultas }, s.key);
          return (
            <li key={s.key} className="flex min-h-12 items-center gap-3 py-1">
              <Icon
                name={s.icon as IconName}
                size={16}
                className="shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <b className="block text-sm">{s.label}</b>
                <span className="block text-[13px] text-muted-foreground">
                  {sectionSubtitle(s.key, escondida)}
                </span>
              </span>
              <Switch
                label={s.label}
                checked={!escondida}
                disabled={!pode}
                onCheckedChange={() => toggle(s.key)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const MORE: {
  section: PanelSection;
  action: Parameters<typeof groupCan>[1];
  icon: IconName;
  label: string;
  sub: string;
}[] = [
  {
    section: 'welcome',
    action: 'content.publish',
    icon: 'book',
    label: 'Boas-vindas',
    sub: 'páginas que o membro vê ao entrar',
  },
  {
    section: 'benefits',
    action: 'benefit.manage',
    icon: 'gift',
    label: 'Benefícios de parceiros',
    sub: 'aparecem em Benefícios',
  },
  {
    section: 'integrations',
    action: 'integration.manage',
    icon: 'link',
    label: 'Integrações e API',
    sub: 'chaves, cota do mês, Zapier e Make',
  },
];

function MoreCard({ g }: { g: MyGroup }) {
  const links = MORE.filter((m) => groupCan(g, m.action));
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="mais" className={cn(card, 'gap-1.5')}>
      <h2 id="mais" className="text-lg font-bold">
        Mais da comunidade
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {links.map((m) => (
          <li key={m.section}>
            <Link
              href={panelHref(g.id, m.section)}
              className="flex min-h-12 items-center gap-3 py-1.5 hover:text-foreground"
            >
              <Icon name={m.icon} size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <b className="block text-sm">{m.label}</b>
                <span className="block text-[13px] text-muted-foreground">{m.sub}</span>
              </span>
              <ChevronRight size={16} aria-hidden className="text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Equipe, e só para o dono: passar adiante e apagar (#404). */
function TeamCard() {
  const g = useOrgGroup();
  const router = useRouter();
  const qc = useQueryClient();
  const ehDono = groupCan(g, 'group.transfer');
  const [transferindo, setTransferindo] = useState(false);
  const [novoDono, setNovoDono] = useState('');
  const [apagando, setApagando] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const ativos = (membros.data ?? []).filter((m) => m.status === 'ACTIVE');
  const porPapel: Partial<Record<GroupRole, number>> = {};
  for (const m of ativos) {
    if (m.role !== 'MEMBER') porPapel[m.role] = (porPapel[m.role] ?? 0) + 1;
  }
  const candidatos = ativos.filter((m) => m.role !== 'OWNER');

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

  return (
    <section aria-labelledby="equipe" className={cn(card, 'gap-2.5')}>
      <h2 id="equipe" className="text-lg font-bold">
        Equipe
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{membros.data ? teamSummaryLabel(porPapel) : ' '}</span>
        {groupCan(g, 'member.role') && (
          <Link
            href={panelHref(g.id, 'team')}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-text"
          >
            Equipe e permissões
          </Link>
        )}
      </div>

      {ehDono && (
        <>
          <hr className="border-border" />
          <b className="text-sm">Passar adiante ou apagar</b>
          <p className="text-[13px] text-muted-foreground">
            Só o dono. Administradores não veem estes botões.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="xs"
              className="gap-1.5 bg-muted hover:bg-surface-3"
              onClick={() => setTransferindo(true)}
            >
              Transferir para…
            </Button>
            <Button variant="danger" size="xs" onClick={() => setApagando(true)}>
              Apagar comunidade
            </Button>
          </div>
        </>
      )}

      <Dialog open={transferindo} onOpenChange={setTransferindo}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transferir a comunidade</DialogTitle>
            <DialogDescription>
              A pessoa passa a ser dona, com a cobrança dos assentos. Você continua na equipe como
              profissional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="novo-dono">Para quem</Label>
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
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setTransferindo(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!novoDono || transferir.isPending}
              onClick={() => transferir.mutate()}
            >
              {transferir.isPending ? 'Transferindo...' : 'Transferir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </section>
  );
}
