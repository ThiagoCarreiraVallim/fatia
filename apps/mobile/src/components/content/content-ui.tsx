import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { Button, cn, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { cores } from '@/theme/cores';

/**
 * Peças de interação das telas de conteúdo da comunidade (planos, dicas,
 * exercícios), no painel da equipe e no lado do membro.
 *
 * Existem porque o mesmo erro se repetia em cada tela: coisa tocável que não
 * parecia tocável (cartão sem seta, "Ver prévia" como texto solto), coisa não
 * tocável que parecia botão (selo "Publicado" verde e cheio, igual a um botão
 * primário) e ação destrutiva com cara de texto qualquer. Centralizar é o que
 * impede a próxima tela de repetir.
 */

/**
 * Selo de estado. Contorno e ponto, nunca fundo cheio: um selo verde cheio é
 * indistinguível do botão primário do app, e a pessoa tenta tocar nele.
 */
export function StatusBadge({
  published,
  feminine = false,
}: {
  published: boolean;
  feminine?: boolean;
}) {
  const label = published ? (feminine ? 'Publicada' : 'Publicado') : 'Rascunho';
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full border px-2 py-0.5',
        published ? 'border-primary' : 'border-border',
      )}
    >
      <View
        className={cn('h-1.5 w-1.5 rounded-full', published ? 'bg-primary' : 'bg-muted-foreground')}
      />
      <Text
        className={cn('text-xs font-medium', published ? 'text-primary' : 'text-muted-foreground')}
      >
        {label}
      </Text>
    </View>
  );
}

/** A seta que diz "isto abre outra tela" — sem ela, cartão de lista parece só informação. */
export function RowChevron() {
  return <ChevronRight size={18} color={cores.mutedForeground} />;
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
    <View className="flex-row items-center justify-between gap-3">
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {count !== undefined ? `${title} (${count})` : title}
      </Text>
      {action}
    </View>
  );
}

/** Botão "Novo …": ícone de mais e o substantivo, para não ser confundido com filtro. */
export function NewButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button size="sm" onPress={onPress} accessibilityLabel={label}>
      <IconLabel
        icon={Plus}
        label={label}
        className="text-primary-foreground"
        color={cores.primaryForeground}
      />
    </Button>
  );
}

/** Ícone + rótulo dentro de um `Button`, que só formata sozinho quando o filho é string. */
export function IconLabel({
  icon: Icon,
  label,
  color = cores.foreground,
  className,
}: {
  icon: LucideIcon;
  label: string;
  color?: string;
  className?: string;
}) {
  return (
    <>
      <Icon size={16} color={color} />
      <Text className={cn('text-sm font-medium text-foreground', className)}>{label}</Text>
    </>
  );
}

/**
 * Apagar: contorno e texto vermelhos com a lixeira. O `ghost` de antes era um
 * "Apagar" em texto branco, igual a qualquer outro texto da tela.
 * A confirmação fica com quem chama (`useConfirm`, um drawer no visual do app).
 */
export function DeleteButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Button
      variant="outline"
      className="border-danger"
      loading={loading}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <IconLabel icon={Trash2} label={label} color={cores.danger} className="text-danger" />
    </Button>
  );
}

/**
 * "Escrever | Prévia" acima do campo de markdown. Antes era um botão-fantasma
 * "Ver prévia"/"Editar" — "Editar" numa tela que já é de edição confundia, e
 * trocar de visão é exatamente o trabalho de uma aba.
 */
export function WritePreviewTabs({
  preview,
  onPreviewChange,
}: {
  preview: boolean;
  onPreviewChange: (preview: boolean) => void;
}) {
  return (
    <Tabs
      value={preview ? 'preview' : 'write'}
      onValueChange={(v) => onPreviewChange(v === 'preview')}
    >
      <TabsList>
        <TabsTrigger value="write">Escrever</TabsTrigger>
        <TabsTrigger value="preview">Prévia</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * Linha marcável (radio, checkbox ou interruptor) com 44 pt de altura e a marca
 * desenhada: o quadrado só pintado de antes não dizia "marcado" para quem não
 * conhece a convenção.
 */
export function CheckableRow({
  label,
  detail,
  checked,
  role,
  disabled,
  onPress,
  children,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  role: 'radio' | 'checkbox' | 'switch';
  disabled?: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[44px] gap-2 rounded-xl border px-3 py-2.5 active:opacity-80',
        checked ? 'border-primary bg-primary/10' : 'border-border',
        disabled && 'opacity-50',
      )}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'h-5 w-5 items-center justify-center border-2',
            role === 'radio' ? 'rounded-full' : 'rounded',
            checked ? 'border-primary' : 'border-muted-foreground',
            checked && role !== 'radio' && 'bg-primary',
          )}
        >
          {checked ? (
            role === 'radio' ? (
              <View className="h-2.5 w-2.5 rounded-full bg-primary" />
            ) : (
              <Check size={14} color={cores.primaryForeground} />
            )
          ) : null}
        </View>
        <Text className="flex-1 text-sm text-foreground">{label}</Text>
        {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
      </View>
      {children}
    </Pressable>
  );
}

/** Opção grande de drawer ("Que tipo de plano?"): ícone, título, explicação e seta. */
export function DrawerOption({
  icon: Icon,
  title,
  description,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      className="min-h-[64px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon size={20} color={cores.primary} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <RowChevron />
    </Pressable>
  );
}

/**
 * Estado de publicação no topo do editor, com a ação que muda o estado ao lado.
 *
 * Antes o estado era uma legenda de 12 px ("Rascunho · por Fulana") e
 * "Publicar" era o segundo de três botões empilhados no fim do formulário,
 * com o mesmo peso de "Fixar no topo". Publicar é o objetivo da tela inteira.
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
  loading,
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
  loading: boolean;
  publishedHint: string;
  draftHint: string;
  onPublish: () => void;
  /** Quem chama confirma antes: tirar do ar some com o conteúdo para os membros na hora. */
  onUnpublish: () => void;
  children?: ReactNode;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <StatusBadge published={published} feminine={feminine} />
        <Text numberOfLines={1} className="flex-1 text-right text-xs text-muted-foreground">
          {`por ${authorName}`}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground">{published ? publishedHint : draftHint}</Text>
      {canEdit ? (
        published ? (
          <Button
            variant="outline"
            loading={loading}
            onPress={onUnpublish}
            accessibilityLabel="Tirar do ar"
          >
            <IconLabel icon={EyeOff} label="Tirar do ar" />
          </Button>
        ) : (
          <>
            <Button
              loading={loading}
              disabled={dirty}
              onPress={onPublish}
              accessibilityLabel="Publicar para os membros"
            >
              <IconLabel
                icon={Eye}
                label="Publicar para os membros"
                color={cores.primaryForeground}
                className="text-primary-foreground"
              />
            </Button>
            {dirty ? (
              <Text className="text-xs text-warning">Salve as mudanças antes de publicar.</Text>
            ) : null}
          </>
        )
      ) : null}
      {children}
    </View>
  );
}
