'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Eye, EyeOff, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Peças de interação das telas de conteúdo da comunidade (planos, dicas,
 * exercícios), no painel da equipe e no lado do membro — equivalente de
 * `apps/mobile/src/components/content/content-ui.tsx`.
 *
 * Existem porque o mesmo erro se repetia em cada tela: coisa clicável que não
 * parecia clicável (cartão sem seta, "Ver prévia" como texto solto), coisa não
 * clicável que parecia botão (selo "Publicado" verde e cheio, igual ao botão
 * primário) e ação destrutiva com cara de texto qualquer. Centralizar é o que
 * impede a próxima tela de repetir.
 */

/**
 * Selo de estado. Contorno e ponto, nunca fundo cheio: um selo verde cheio é
 * indistinguível do botão primário, e a pessoa tenta clicar nele.
 */
export function StatusBadge({
  published,
  feminine = false,
  className,
}: {
  published: boolean;
  feminine?: boolean;
  className?: string;
}) {
  const label = published ? (feminine ? 'Publicada' : 'Publicado') : 'Rascunho';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2 py-0.5 text-xs font-medium',
        published ? 'border-primary text-primary' : 'border-subtle text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', published ? 'bg-primary' : 'bg-muted-foreground')}
      />
      {label}
    </span>
  );
}

/** A seta que diz "isto abre outra tela" — sem ela, cartão de lista parece só informação. */
export function RowChevron() {
  return <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />;
}

/** Título de seção com a contagem e a ação de criar à direita, no lugar onde o olho procura. */
export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">
        {count !== undefined ? `${title} (${count})` : title}
      </h2>
      {action}
    </div>
  );
}

/**
 * Botão "Novo …": ícone de mais e o substantivo, para não ser confundido com
 * filtro. Com `href` vira link (abre em outra aba como qualquer link); com
 * `onClick`, abre a escolha que vem antes (o drawer do tipo de plano).
 */
export function NewButton({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <Button asChild size="sm">
        <Link href={href}>
          <Plus aria-hidden />
          {label}
        </Link>
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={onClick}>
      <Plus aria-hidden />
      {label}
    </Button>
  );
}

/**
 * Apagar: contorno e texto vermelhos com a lixeira. O `ghost` de antes era um
 * "Apagar" igual a "Voltar", colado no "Salvar". A confirmação fica com quem
 * chama (`ConfirmDialog`).
 */
export function DeleteButton({
  label,
  onClick,
  pending,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="border-danger text-danger hover:bg-danger/10 hover:text-danger"
      disabled={pending}
      onClick={onClick}
    >
      <Trash2 aria-hidden />
      {label}
    </Button>
  );
}

/**
 * "Escrever | Prévia" acima do campo de markdown. Antes era um botão-fantasma
 * "Ver prévia"/"Editar" — "Editar" numa tela que já é de edição confundia, e
 * trocar de visão é exatamente o trabalho de uma aba.
 */
export function WritePreviewTabs({ write, preview }: { write: ReactNode; preview: ReactNode }) {
  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Escrever</TabsTrigger>
        <TabsTrigger value="preview">Prévia</TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="mt-2">
        {write}
      </TabsContent>
      <TabsContent value="preview" className="mt-2">
        {preview}
      </TabsContent>
    </Tabs>
  );
}

/**
 * Linha marcável (checkbox, radio ou interruptor) com 44 px de altura e a
 * linha inteira clicável, que se pinta quando marcada: a caixinha solta de
 * 16 px de antes era o único alvo e passava despercebida.
 */
export function CheckableRow({
  label,
  detail,
  checked,
  role,
  name,
  disabled,
  onChange,
  children,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  role: 'radio' | 'checkbox' | 'switch';
  /** Agrupa os radios. */
  name?: string;
  disabled?: boolean;
  onChange: () => void;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer flex-col gap-2 rounded-xl border border-subtle px-3 py-2.5 text-sm transition-colors hover:border-primary/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        checked && 'border-primary bg-primary/10',
        disabled && 'cursor-default opacity-50 hover:border-subtle',
      )}
    >
      <span className="flex items-center gap-3">
        <input
          type={role === 'radio' ? 'radio' : 'checkbox'}
          role={role === 'switch' ? 'switch' : undefined}
          name={name}
          className="h-4 w-4 shrink-0 accent-primary"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {detail && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
      </span>
      {children}
    </label>
  );
}

/** Opção grande de drawer ("Que tipo de plano?"): ícone, título, explicação e seta. */
export function DrawerOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-subtle bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon size={20} aria-hidden className="text-primary" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <RowChevron />
    </button>
  );
}

/**
 * Lista que não carregou. Antes o erro caía no estado vazio e dizia "Nenhum
 * plano ainda" — mentira que leva a criar de novo o que já existe.
 */
export function ListError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <EmptyState
      title={title}
      description="Tente de novo em alguns instantes."
      action={
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      }
    />
  );
}

/**
 * Estado de publicação no topo do editor, com a ação que muda o estado ao lado.
 *
 * Antes o estado era um selo solto com "Por Fulana", e "Publicar" era o segundo
 * de quatro botões no fim do formulário, com o mesmo peso de "Voltar".
 * Publicar é o objetivo da tela inteira.
 *
 * Publicar manda a versão salva. Com mudança pendente o botão fica desligado e
 * diz por quê — antes dava para publicar achando que ia o que estava na tela.
 */
export function PublishCard({
  published,
  feminine = false,
  authorName,
  canEdit,
  dirty,
  pending,
  publishedHint,
  draftHint,
  onPublish,
  onUnpublish,
  children,
}: {
  published: boolean;
  feminine?: boolean;
  authorName: string;
  canEdit: boolean;
  dirty: boolean;
  pending: boolean;
  publishedHint: string;
  draftHint: string;
  onPublish: () => void;
  /** Quem chama confirma antes: tirar do ar some com o conteúdo para os membros na hora. */
  onUnpublish: () => void;
  children?: ReactNode;
}) {
  const dirtyId = useId();
  return (
    <section
      aria-label="Publicação"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge published={published} feminine={feminine} />
        <span className="min-w-0 truncate text-xs text-muted-foreground">por {authorName}</span>
      </div>
      <p className="text-xs text-muted-foreground">{published ? publishedHint : draftHint}</p>
      {canEdit &&
        (published ? (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onUnpublish}
          >
            <EyeOff aria-hidden />
            Tirar do ar
          </Button>
        ) : (
          <div className="space-y-1.5">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={dirty || pending}
              aria-describedby={dirty ? dirtyId : undefined}
              onClick={onPublish}
            >
              <Eye aria-hidden />
              Publicar para os membros
            </Button>
            {dirty && (
              <p id={dirtyId} className="text-xs text-warning">
                Salve as mudanças antes de publicar.
              </p>
            )}
          </div>
        ))}
      {children}
    </section>
  );
}
