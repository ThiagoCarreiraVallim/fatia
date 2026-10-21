import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentApi,
  MAX_TIP_BODY,
  TIP_CATEGORIES,
  TIP_CATEGORY_LABEL,
  type GroupTip,
  type MyGroup,
  type TipCategory,
} from '@fatia/api-client';
import {
  CheckableRow,
  DeleteButton,
  PublishCard,
  WritePreviewTabs,
} from '@/components/content/content-ui';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, useConfirm } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

function Editor({ g, tip }: { g: MyGroup; tip: GroupTip | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const editavel = tip === null || tip.canEdit !== false;
  const [titulo, setTitulo] = useState(tip?.title ?? '');
  const [categoria, setCategoria] = useState<TipCategory>(tip?.category ?? 'GENERAL');
  const [corpo, setCorpo] = useState(tip?.body ?? '');
  const [imagem, setImagem] = useState<ImageValue | null>(
    tip?.image ? { fileId: tip.image.id, url: tip.image.url } : null,
  );
  const [previa, setPrevia] = useState(false);
  const snapshot = JSON.stringify([titulo, categoria, corpo, imagem?.fileId]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;
  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });

  const salvar = useMutation({
    mutationFn: (_saved: string) => {
      const input = {
        title: titulo.trim(),
        body: corpo.trim(),
        category: categoria,
        imageFileId: imagem?.fileId ?? null,
      };
      return tip ? contentApi.updateTip(g.id, tip.id, input) : contentApi.createTip(g.id, input);
    },
    onSuccess: (d, saved) => {
      setSavedSnapshot(saved);
      toast.show({
        message: tip ? 'Dica salva.' : 'Rascunho criado. Publique quando estiver pronta.',
      });
      void invalidar();
      if (!tip) router.replace(`/org/${g.id}/content/tips/${d.id}`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });
  const estado = useMutation({
    mutationFn: (s: { published?: boolean; pinned?: boolean }) =>
      contentApi.setTipState(g.id, tip!.id, s),
    onSuccess: (d, s) => {
      if (s.published !== undefined) {
        toast.show({ message: d.publishedAt ? 'Publicada para os membros.' : 'Saiu do ar.' });
      } else if (s.pinned !== undefined) {
        // Fixar vale na hora, sem "Salvar": o aviso é o que confirma que valeu.
        toast.show({ message: d.pinned ? 'Fixada no topo das dicas.' : 'Não está mais fixada.' });
      }
      void invalidar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para mudar agora.') }),
  });
  const apagar = useMutation({
    mutationFn: () => contentApi.deleteTip(g.id, tip!.id),
    onSuccess: () => {
      toast.show({ message: 'Dica apagada.' });
      void invalidar();
      // Voltar à lista que já está atrás, na aba de dicas; recriá-la abria em Planos.
      if (router.canGoBack()) router.back();
      else router.replace(`/org/${g.id}/content?tab=tips`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  return (
    <>
      {tip ? (
        <PublishCard
          published={Boolean(tip.publishedAt)}
          feminine
          authorName={tip.authorName}
          canEdit={editavel}
          dirty={dirty}
          loading={estado.isPending && estado.variables?.published !== undefined}
          publishedHint="Os membros veem esta dica na comunidade."
          draftHint="Só a equipe vê. Publique quando estiver pronta."
          onPublish={() => estado.mutate({ published: true })}
          onUnpublish={() =>
            confirm({
              title: 'Tirar esta dica do ar?',
              description: 'Ela some para os membros na hora.',
              confirmLabel: 'Tirar do ar',
              destructive: true,
              onConfirm: () => estado.mutate({ published: false }),
            })
          }
        >
          {/* Interruptor, e não um terceiro botão empilhado igual a "Publicar":
              fixar é um estado ligado/desligado, e vale na hora. */}
          {editavel ? (
            <CheckableRow
              role="switch"
              label="Fixar no topo"
              detail="Aparece antes das outras"
              checked={tip.pinned}
              disabled={estado.isPending}
              onPress={() => estado.mutate({ pinned: !tip.pinned })}
            />
          ) : null}
        </PublishCard>
      ) : null}
      {!editavel ? (
        <Text className="rounded-xl bg-muted p-3 text-sm text-foreground">
          Só quem publicou, ou o dono, muda esta dica.
        </Text>
      ) : null}
      <PanelCard title={tip ? 'Dica' : 'Nova dica'}>
        <Input
          value={titulo}
          onChangeText={setTitulo}
          editable={editavel}
          maxLength={100}
          accessibilityLabel="Título"
          placeholder="Título"
        />
        {editavel ? (
          <Choice
            label="Categoria"
            options={TIP_CATEGORIES.map((c) => ({ value: c, label: TIP_CATEGORY_LABEL[c] }))}
            value={categoria}
            onChange={setCategoria}
          />
        ) : null}
        <WritePreviewTabs preview={previa} onPreviewChange={setPrevia} />
        {previa ? (
          <View
            accessibilityLabel="Prévia da dica"
            className="min-h-[96px] rounded-xl border border-border p-3"
          >
            <MarkdownLite source={corpo || 'Nada escrito ainda.'} />
          </View>
        ) : (
          <Input
            value={corpo}
            onChangeText={setCorpo}
            editable={editavel}
            maxLength={MAX_TIP_BODY}
            multiline
            className="min-h-[160px]"
            textAlignVertical="top"
            accessibilityLabel="Texto"
            placeholder="Texto da dica"
          />
        )}
        <Text className="text-xs text-muted-foreground">
          {`**negrito**, *itálico*, listas com "- ". ${corpo.length}/${MAX_TIP_BODY}`}
        </Text>
        {editavel ? (
          <ImageField groupId={g.id} label="Imagem" value={imagem} onChange={setImagem} />
        ) : null}
      </PanelCard>

      {editavel ? (
        <View className="gap-6">
          <Button
            loading={salvar.isPending}
            disabled={tip !== null && !dirty}
            onPress={() => {
              if (!titulo.trim() || !corpo.trim()) {
                toast.show({ message: 'Preencha o título e o texto da dica.' });
              } else salvar.mutate(snapshot);
            }}
          >
            {tip === null ? 'Criar rascunho' : dirty ? 'Salvar mudanças' : 'Tudo salvo'}
          </Button>
          {tip ? (
            <DeleteButton
              label="Apagar dica"
              loading={apagar.isPending}
              onPress={() =>
                confirm({
                  title: 'Apagar esta dica?',
                  description: 'Ela some para os membros, e a imagem é apagada junto.',
                  confirmLabel: 'Apagar',
                  destructive: true,
                  onConfirm: () => apagar.mutate(),
                })
              }
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function Carregar({ g, tipId }: { g: MyGroup; tipId: string }) {
  const nova = tipId === 'new';
  const dicas = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
    enabled: !nova,
  });
  if (nova) return <Editor key="new" g={g} tip={null} />;
  if (dicas.isPending) return <LoadingState label="Carregando a dica…" />;
  const tip = dicas.data?.find((d) => d.id === tipId);
  if (!tip) {
    return (
      <EmptyState
        title="Dica não encontrada"
        description="Ela foi apagada, ou o endereço está errado."
      />
    );
  }
  return <Editor key={tip.id} g={g} tip={tip} />;
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/content/tips/[tipId]/page.tsx`. */
export default function OrgTipScreen() {
  const { groupId, tipId } = useLocalSearchParams<{ groupId: string; tipId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Carregar g={g} tipId={tipId} />}</OrgPanel>;
}
