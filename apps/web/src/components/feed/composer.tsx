'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  displayNameProblem,
  feedApi,
  POST_BODY_MAX,
  POST_MAX_IMAGES,
  postProblem,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import type { ImageValue } from '@/components/content/image-field';
import { PhotosField } from '@/components/content/photos-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiMessage, NicknameField, type MyName } from './feed-ui';

/** Escrever no mural: texto, até 4 imagens e, na primeira vez, o apelido. */
export function Composer({ groupId, me }: { groupId: string; me: MyName }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<ImageValue[]>([]);
  const [apelido, setApelido] = useState(me.suggested);

  const publicar = useMutation({
    mutationFn: () =>
      feedApi.create(groupId, {
        body: texto.trim(),
        imageFileIds: imagens.map((i) => i.fileId),
        ...(me.displayName ? {} : { displayName: apelido.trim() }),
      }),
    onSuccess: () => {
      setTexto('');
      setImagens([]);
      toast('Publicado no mural.');
      void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para publicar agora.')),
  });

  const problema =
    postProblem(texto, imagens.length) ?? (me.displayName ? null : displayNameProblem(apelido));
  const escreveu = texto.trim().length > 0 || imagens.length > 0;

  return (
    <form
      aria-label="Novo post"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) publicar.mutate();
      }}
    >
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={POST_BODY_MAX}
        rows={3}
        aria-label="O que você quer contar para a comunidade?"
        placeholder="O que você quer contar para a comunidade?"
      />
      <PhotosField
        groupId={groupId}
        value={imagens}
        onChange={setImagens}
        purpose="post_image"
        max={POST_MAX_IMAGES}
        label="Imagens"
        listLabel="Imagens do post"
        addLabel="Adicionar imagens"
        hint={`Até ${POST_MAX_IMAGES} imagens. Localização e dados da câmera são apagados.`}
      />
      {!me.displayName && escreveu && <NicknameField value={apelido} onChange={setApelido} />}
      {problema && escreveu && (
        <p role="alert" className="text-xs text-danger">
          {problema}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={Boolean(problema) || publicar.isPending}>
          {publicar.isPending ? 'Publicando…' : 'Publicar'}
        </Button>
      </div>
    </form>
  );
}
