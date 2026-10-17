'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  groupsApi,
  joinPolicyLabel,
  joinResultMessage,
  type GroupPreview,
  type JoinConsent,
} from '@fatia/api-client';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (groupId: string) => void;
}

/**
 * Entrar pelo código que a academia ou o treinador divulga: primeiro a
 * comunidade, depois o que compartilhar. Comunidade só por convite responde como
 * código inexistente, de propósito.
 */
export function JoinByCodeDrawer({ open, onOpenChange, onJoined }: Props) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<GroupPreview | null>(null);

  const reset = (aberto: boolean) => {
    if (!aberto) {
      setCode('');
      setPreview(null);
      look.reset();
      join.reset();
    }
    onOpenChange(aberto);
  };

  const look = useMutation({
    mutationFn: (slug: string) => groupsApi.previewBySlug(slug),
    onSuccess: setPreview,
  });

  const join = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.join(preview!.slug, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast(joinResultMessage(r));
      reset(false);
      onJoined(r.groupId);
    },
  });

  const lookError = look.isError
    ? look.error instanceof ApiError && look.error.isNotFound
      ? 'Nenhuma comunidade com esse código.'
      : 'Não deu para procurar agora. Tente de novo.'
    : null;
  const joinError = join.isError
    ? join.error instanceof ApiError && join.error.isConflict
      ? join.error.message
      : 'Não deu para entrar agora. Tente de novo.'
    : null;

  return (
    <Drawer open={open} onOpenChange={reset}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{preview ? preview.name : 'Entrar com código'}</DrawerTitle>
          <DrawerDescription>
            {preview
              ? `${joinPolicyLabel(preview.joinPolicy)} · ${preview.memberCount} ${preview.memberCount === 1 ? 'membro' : 'membros'}`
              : 'O código que sua academia ou seu treinador divulgou.'}
          </DrawerDescription>
        </DrawerHeader>

        {preview ? (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">
            {preview.description && (
              <p className="text-sm text-muted-foreground">{preview.description}</p>
            )}
            <ConsentForm
              team={preview.team}
              submitLabel={preview.joinPolicy === 'OPEN' ? 'Entrar' : 'Pedir para entrar'}
              pending={join.isPending}
              error={joinError}
              onSubmit={(consent) => join.mutate(consent)}
              secondary={
                <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                  Outro código
                </Button>
              }
            />
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const slug = code.trim().toLowerCase();
              if (slug) look.mutate(slug);
            }}
          >
            <Input
              aria-label="Código da comunidade"
              placeholder="ex.: academia-centro"
              autoCapitalize="none"
              autoCorrect="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {lookError && (
              <p role="alert" className="text-sm text-danger">
                {lookError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!code.trim() || look.isPending}>
              {look.isPending ? 'Procurando…' : 'Continuar'}
            </Button>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
