'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crown } from 'lucide-react';
import {
  alreadyInView,
  ApiError,
  ENTRY_INVALID,
  entryPolicyView,
  groupsApi,
  joinResultMessage,
  parseCommunityEntry,
  proOfferNote,
  VISIBILITY_WORD,
  type CommunityEntry,
  type JoinConsent,
  type ProOffer,
  type ShareScope,
  type TeamMember,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { ConsentForm } from './consent-form';
import { GroupAvatar } from './group-avatar';
import { communityKeys } from './query-keys';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (groupId: string) => void;
  /** O código que veio no link do QR (`/community?join=1&code=…`): já procura. */
  initialCode?: string | null;
}

/** A comunidade achada, venha de código ou de convite: o cartão do Cm-02. */
interface Found {
  entry: CommunityEntry;
  groupId: string;
  /** Patrocinada: o avatar leva a cor da comunidade, como no cartão da lista. */
  sponsored: boolean;
  name: string;
  meta: string;
  badge: string;
  tone: 'done' | 'lite' | 'pending';
  text: string;
  cta: string;
  proOffer: ProOffer;
  team: TeamMember[];
  required: ShareScope[];
}

const TONE = { ok: 'done', warn: 'lite', muted: 'pending' } as const;
const TYPE_WORD = { SPONSORED: 'patrocinada', SOCIAL: 'social' } as const;
const membros = (n: number) => `${n} ${n === 1 ? 'membro' : 'membros'}`;

async function lookup(entry: CommunityEntry): Promise<Found> {
  if (entry.kind === 'invite') {
    const c = await groupsApi.previewInvite(entry.token);
    return {
      entry,
      groupId: c.group.id,
      sponsored: c.group.type === 'SPONSORED',
      name: c.group.name,
      meta: `${TYPE_WORD[c.group.type]} · ${membros(c.memberCount)}`,
      badge: 'convite',
      tone: 'done',
      text: c.invitedBy ? `Convite de ${c.invitedBy}: entra na hora` : 'O convite já é a aprovação',
      cta: 'Entrar',
      proOffer: null,
      team: c.team,
      required: c.requiredSharingScopes,
    };
  }
  const g = await groupsApi.previewByCode(entry.code);
  const policy = entryPolicyView(g.joinPolicy);
  return {
    entry: { kind: 'code', code: g.code },
    groupId: g.id,
    sponsored: g.type === 'SPONSORED',
    name: g.name,
    meta: `${TYPE_WORD[g.type]} · ${VISIBILITY_WORD[g.visibility]} · ${membros(g.memberCount)}`,
    badge: policy.badge,
    tone: TONE[policy.tone],
    text: policy.text,
    cta: policy.cta,
    proOffer: g.proOffer,
    team: g.team,
    required: g.requiredSharingScopes,
  };
}

/**
 * Entrar numa comunidade (Cm-02): o código ou o link que a academia divulgou,
 * a comunidade com a forma de entrada, e só então o que compartilhar (#371).
 * Na web não há leitura de QR: o link do QR também serve digitado ou colado.
 * Código inválido, vencido, revogado ou de comunidade só por convite dá a mesma
 * frase, sem dizer se a comunidade existe.
 */
export function JoinByCodeDrawer({ open, onOpenChange, onJoined, initialCode }: Props) {
  const qc = useQueryClient();
  const [code, setCode] = useState(initialCode ?? '');
  const [found, setFound] = useState<Found | null>(null);
  const [sharing, setSharing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // A lista da tela de trás (já em cache): quem já está na comunidade não refaz o pedido.
  const mine = useQuery({ queryKey: communityKeys.mine, queryFn: () => groupsApi.mine() });

  const look = useMutation({
    mutationFn: lookup,
    onSuccess: (f) => {
      setFound(f);
      setInvalid(false);
    },
    onError: (err) => setInvalid(err instanceof ApiError && err.isNotFound),
  });

  const join = useMutation({
    mutationFn: (consent: JoinConsent) =>
      found!.entry.kind === 'invite'
        ? groupsApi.acceptInvite(found!.entry.token, consent)
        : groupsApi.join(found!.entry.code, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['billing'] });
      toast(joinResultMessage(r));
      reset(false);
      onJoined(r.groupId);
    },
  });

  function reset(aberto: boolean) {
    if (!aberto) {
      setCode('');
      setFound(null);
      setSharing(false);
      setInvalid(false);
      look.reset();
      join.reset();
    }
    onOpenChange(aberto);
  }

  function search(raw: string) {
    const entry = parseCommunityEntry(raw);
    setFound(null);
    if (!entry) {
      setInvalid(true);
      return;
    }
    look.mutate(entry);
  }

  // O link do QR abre a folha já com o código: procura uma vez.
  const autoLooked = useRef(false);
  useEffect(() => {
    if (!open || !initialCode || autoLooked.current) return;
    autoLooked.current = true;
    const entry = parseCommunityEntry(initialCode);
    if (entry) look.mutate(entry);
  }, [open, initialCode, look]);

  const lookError = invalid
    ? ENTRY_INVALID
    : look.isError
      ? 'Não deu para procurar agora. Tente de novo.'
      : null;
  // 409 traz a frase do servidor: já é membro, ou falta compartilhar o que a
  // comunidade exige (o dono pode ter mudado a exigência depois do cartão abrir).
  const joinError = join.isError
    ? join.error instanceof ApiError && join.error.isConflict
      ? join.error.message
      : 'Não deu para entrar agora. Tente de novo.'
    : null;

  const already = found ? alreadyInView(mine.data, found.groupId) : null;
  const card = found
    ? already
      ? { badge: already.badge, tone: TONE[already.tone], text: already.text }
      : { badge: found.badge, tone: found.tone, text: found.text }
    : null;

  return (
    <Drawer open={open} onOpenChange={reset}>
      <DrawerContent className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle>
            {sharing && found ? `O que compartilhar com ${found.name}` : 'Entrar numa comunidade'}
          </DrawerTitle>
          <DrawerDescription>
            {sharing
              ? 'A equipe vê só o que você ligar aqui. Dá para mudar depois, em Sobre.'
              : 'Leia o QR Code da recepção pelo app, ou digite o código ou o link que sua academia ou treinador divulgou.'}
          </DrawerDescription>
        </DrawerHeader>

        {sharing && found ? (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">
            <ConsentForm
              team={found.team}
              required={found.required}
              submitLabel={found.cta}
              pending={join.isPending}
              error={joinError}
              onSubmit={(consent) => join.mutate(consent)}
              secondary={
                <Button type="button" variant="ghost" onClick={() => setSharing(false)}>
                  Voltar
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                search(code);
              }}
            >
              <label htmlFor="community-code" className="text-xs text-muted-foreground">
                Código ou link
              </label>
              <Input
                id="community-code"
                placeholder="AD7K3Q9P"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                className="h-14 bg-surface-3 text-center font-display text-xl font-bold tracking-wider"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setInvalid(false);
                }}
              />
              {lookError && (
                <p role="alert" className="text-sm text-danger">
                  {lookError}
                </p>
              )}
              {!found && (
                <Button type="submit" className="w-full" disabled={!code.trim() || look.isPending}>
                  {look.isPending ? 'Procurando…' : 'Continuar'}
                </Button>
              )}
            </form>

            {found && (
              <>
                <section
                  aria-label="Comunidade encontrada"
                  className="space-y-3 rounded-2xl bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <GroupAvatar
                      name={found.name}
                      url={null}
                      className={found.sponsored ? 'bg-brand text-brand-foreground' : undefined}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{found.name}</p>
                      <p className="text-xs text-muted-foreground">{found.meta}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={card!.tone}>{card!.badge}</Badge>
                    <span className="text-xs text-muted-foreground">{card!.text}</span>
                  </div>
                  {!already && proOfferNote(found.proOffer) && (
                    <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm">
                      <Crown size={16} className="shrink-0 text-primary" aria-hidden />
                      {proOfferNote(found.proOffer)}
                    </p>
                  )}
                </section>
                {already ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      const id = found.groupId;
                      reset(false);
                      onJoined(id);
                    }}
                  >
                    {already.cta}
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => setSharing(true)}>
                    {found.cta}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
