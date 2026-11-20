'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Plus, X } from 'lucide-react';
import {
  feedApi,
  POLL_MAX_OPTIONS,
  POLL_MIN_VOTES,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  POST_MAX_IMAGES,
  pollProblem,
  postProblem,
  type CreatePostInput,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import type { ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { PhotosField } from '@/components/content/photos-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiMessage, type MyName } from './feed-ui';

/** "Fecha em" da prancha Cm-06b. */
const POLL_DAYS = [
  { value: '1', label: '1 dia' },
  { value: '3', label: '3 dias' },
  { value: '7', label: '1 semana' },
];
/** O aviso fixado pelo composer sai do topo sozinho; o painel escolhe outro prazo. */
const COMPOSER_PIN_DAYS = 7;

/** A barra de formatação: insere a marcação no cursor. */
const TOOLS: { label: string; aria: string; pre: string; post?: string; line?: boolean }[] = [
  { label: 'B', aria: 'Negrito', pre: '**', post: '**' },
  { label: 'I', aria: 'Itálico', pre: '_', post: '_' },
  { label: 'T', aria: 'Título', pre: '# ', line: true },
  { label: 'Lista', aria: 'Item de lista', pre: '- ', line: true },
  { label: 'Citação', aria: 'Citação', pre: '> ', line: true },
  { label: 'Link', aria: 'Link', pre: '[', post: '](https://)' },
];

export interface ComposerTeam {
  /** O nome da comunidade, para o "Publicar como". */
  groupName: string;
}

/**
 * Escrever no mural (pranchas Cm-06 e Cm-06b): post com Markdown e até 4
 * imagens, ou enquete. A equipe escolhe publicar em nome da comunidade e fixar
 * como aviso. O nome é o do perfil, sem pergunta.
 */
export function Composer({
  groupId,
  me,
  team,
  onClose,
}: {
  groupId: string;
  me: MyName;
  team?: ComposerTeam | null;
  /** Aberto pela linha "Escreva para a comunidade…": Cancelar e publicar fecham. */
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const area = useRef<HTMLTextAreaElement>(null);
  const [tipo, setTipo] = useState<'POST' | 'POLL'>('POST');
  const [vista, setVista] = useState<'write' | 'preview'>('write');
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<ImageValue[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [opcoes, setOpcoes] = useState<string[]>(['', '']);
  const [dias, setDias] = useState('3');
  const [comoGrupo, setComoGrupo] = useState(false);
  const [fixar, setFixar] = useState(false);

  const limpar = () => {
    setTexto('');
    setImagens([]);
    setPergunta('');
    setOpcoes(['', '']);
    setFixar(false);
    setVista('write');
  };

  const publicar = useMutation({
    mutationFn: () => {
      const input: CreatePostInput =
        tipo === 'POLL'
          ? {
              kind: 'POLL',
              poll: {
                question: pergunta.trim(),
                options: opcoes.map((o) => o.trim()).filter(Boolean),
                days: Number(dias),
              },
              ...(texto.trim() ? { body: texto.trim() } : {}),
            }
          : { body: texto.trim(), imageFileIds: imagens.map((i) => i.fileId) };
      if (team) {
        if (comoGrupo) input.publishedAs = 'GROUP';
        if (fixar) {
          input.pin = true;
          input.pinDays = COMPOSER_PIN_DAYS;
        }
      }
      return feedApi.create(groupId, input);
    },
    onSuccess: () => {
      limpar();
      toast(tipo === 'POLL' ? 'Enquete publicada no mural.' : 'Publicado no mural.');
      void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
      onClose?.();
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para publicar agora.')),
  });

  const problema =
    tipo === 'POLL'
      ? (pollProblem(pergunta, opcoes) ??
        (texto.trim().length > POST_BODY_MAX
          ? `O texto tem até ${POST_BODY_MAX} caracteres.`
          : null))
      : postProblem(texto, imagens.length);
  const escreveu =
    tipo === 'POLL'
      ? pergunta.trim().length > 0 || opcoes.some((o) => o.trim())
      : texto.trim().length > 0 || imagens.length > 0;

  const inserir = (t: (typeof TOOLS)[number]) => {
    const el = area.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const sel = texto.slice(ini, fim) || 'texto';
    const quebra = t.line && ini > 0 && texto[ini - 1] !== '\n' ? '\n' : '';
    const novo = `${texto.slice(0, ini)}${quebra}${t.pre}${t.line ? texto.slice(ini, fim) : sel}${
      t.post ?? ''
    }${texto.slice(fim)}`;
    setTexto(novo.slice(0, POST_BODY_MAX));
    requestAnimationFrame(() => el?.focus());
  };

  // Aberto pela linha do mural: o cursor já vai para o texto.
  useEffect(() => {
    if (onClose) area.current?.focus();
  }, [onClose]);

  return (
    <form
      aria-label="Novo post"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) publicar.mutate();
      }}
    >
      {team && (
        <Segmented
          label="Publicar como"
          value={comoGrupo ? 'group' : 'me'}
          options={[
            { value: 'me', label: `Eu, ${me.displayName}` },
            { value: 'group', label: team.groupName },
          ]}
          onChange={(v) => setComoGrupo(v === 'group')}
        />
      )}
      <Segmented
        label="Tipo"
        value={tipo}
        options={[
          { value: 'POST', label: 'Post' },
          { value: 'POLL', label: 'Enquete' },
        ]}
        onChange={setTipo}
      />

      {tipo === 'POLL' && (
        <div className="space-y-3">
          <Input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            maxLength={POLL_QUESTION_MAX}
            aria-label="Pergunta"
            placeholder="Pergunta"
          />
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">
              Opções · até {POLL_MAX_OPTIONS}
            </legend>
            {opcoes.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o}
                  onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={POLL_OPTION_MAX}
                  aria-label={`Opção ${i + 1}`}
                  placeholder="Opção"
                />
                {opcoes.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Tirar a opção ${i + 1}`}
                    onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))}
                    className="rounded p-2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {opcoes.length < POLL_MAX_OPTIONS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpcoes([...opcoes, ''])}
              >
                <Plus size={14} aria-hidden /> Adicionar opção
              </Button>
            )}
          </fieldset>
          <Segmented label="Fecha em" value={dias} options={POLL_DAYS} onChange={setDias} />
          <p className="text-xs text-muted-foreground">
            O voto de cada pessoa não aparece. O resultado só mostra com {POLL_MIN_VOTES} votos ou
            mais.
          </p>
        </div>
      )}

      <Segmented
        label="Modo"
        value={vista}
        options={[
          { value: 'write', label: 'Escrever' },
          { value: 'preview', label: 'Prévia' },
        ]}
        onChange={setVista}
      />
      {vista === 'write' ? (
        <div className="space-y-2">
          <div role="toolbar" aria-label="Formatação" className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-label={t.aria}
                onClick={() => inserir(t)}
                className="min-h-[32px] rounded-lg border border-subtle px-2 text-xs hover:bg-accent/40"
              >
                {t.label}
              </button>
            ))}
          </div>
          <Textarea
            ref={area}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={POST_BODY_MAX}
            rows={3}
            aria-label={
              tipo === 'POLL'
                ? 'Contexto da enquete (opcional)'
                : 'O que você quer contar para a comunidade?'
            }
            placeholder={
              tipo === 'POLL'
                ? 'Contexto da enquete (opcional)'
                : 'O que você quer contar para a comunidade?'
            }
          />
          <p className="text-xs text-muted-foreground">
            Aceita Markdown: **negrito**, _itálico_, # título, - lista, &gt; citação e
            [texto](link).
          </p>
        </div>
      ) : (
        <div
          aria-label="Prévia do post"
          className="min-h-[72px] rounded-xl border border-dashed border-subtle p-3"
        >
          {texto.trim() ? (
            <MarkdownLite source={texto} />
          ) : (
            <p className="text-sm text-muted-foreground">Nada para mostrar ainda.</p>
          )}
        </div>
      )}

      {tipo === 'POST' && (
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
      )}

      {team && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-medium">Fixar como aviso</span>
            <span className="block text-xs text-muted-foreground">
              Entra no carrossel do topo do mural por {COMPOSER_PIN_DAYS} dias
            </span>
          </span>
          <Switch checked={fixar} onCheckedChange={setFixar} label="Fixar como aviso" />
        </div>
      )}

      {problema && escreveu && (
        <p role="alert" className="text-xs text-danger">
          {problema}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={Boolean(problema) || publicar.isPending}>
          {publicar.isPending ? 'Publicando…' : 'Publicar'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A linha "Escreva para a comunidade…" do topo do mural (prancha Cm-03): o
 * composer só abre quando a pessoa vai escrever, e o mural fica à vista.
 */
export function ComposerEntry(props: { groupId: string; me: MyName; team?: ComposerTeam | null }) {
  const [aberto, setAberto] = useState(false);
  if (aberto) return <Composer {...props} onClose={() => setAberto(false)} />;
  return (
    <button
      type="button"
      onClick={() => setAberto(true)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-subtle bg-card px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <span className="flex-1">Escreva para a comunidade…</span>
      <ImagePlus className="size-4 shrink-0" aria-hidden />
    </button>
  );
}
