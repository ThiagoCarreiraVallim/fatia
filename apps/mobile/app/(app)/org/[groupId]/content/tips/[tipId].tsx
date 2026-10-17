import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
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
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

function Editor({ g, tip }: { g: MyGroup; tip: GroupTip | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const editavel = tip === null || tip.canEdit !== false;
  const [titulo, setTitulo] = useState(tip?.title ?? '');
  const [categoria, setCategoria] = useState<TipCategory>(tip?.category ?? 'GENERAL');
  const [corpo, setCorpo] = useState(tip?.body ?? '');
  const [imagem, setImagem] = useState<ImageValue | null>(
    tip?.image ? { fileId: tip.image.id, url: tip.image.url } : null,
  );
  const [previa, setPrevia] = useState(false);
  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });

  const salvar = useMutation({
    mutationFn: () => {
      const input = {
        title: titulo.trim(),
        body: corpo.trim(),
        category: categoria,
        imageFileId: imagem?.fileId ?? null,
      };
      return tip ? contentApi.updateTip(g.id, tip.id, input) : contentApi.createTip(g.id, input);
    },
    onSuccess: (d) => {
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
      router.replace(`/org/${g.id}/content`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  return (
    <>
      {tip ? (
        <Text className="text-xs text-muted-foreground">
          {`${tip.publishedAt ? 'Publicada' : 'Rascunho'}${tip.pinned ? ' · fixada' : ''} · por ${tip.authorName}`}
        </Text>
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
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted-foreground">
            {`**negrito**, *itálico*, listas com "- ". ${corpo.length}/${MAX_TIP_BODY}`}
          </Text>
          <Button size="sm" variant="ghost" onPress={() => setPrevia(!previa)}>
            {previa ? 'Editar' : 'Ver prévia'}
          </Button>
        </View>
        {editavel ? (
          <ImageField groupId={g.id} label="Imagem" value={imagem} onChange={setImagem} />
        ) : null}
      </PanelCard>

      {editavel ? (
        <View className="gap-2">
          <Button
            loading={salvar.isPending}
            onPress={() => {
              if (!titulo.trim() || !corpo.trim()) {
                toast.show({ message: 'Preencha o título e o texto da dica.' });
              } else salvar.mutate();
            }}
          >
            {tip ? 'Salvar' : 'Criar rascunho'}
          </Button>
          {tip ? (
            <>
              <Button
                variant="outline"
                loading={estado.isPending}
                onPress={() => estado.mutate({ published: !tip.publishedAt })}
              >
                {tip.publishedAt ? 'Tirar do ar' : 'Publicar'}
              </Button>
              <Button variant="outline" onPress={() => estado.mutate({ pinned: !tip.pinned })}>
                {tip.pinned ? 'Desafixar' : 'Fixar no topo'}
              </Button>
              <Button
                variant="ghost"
                onPress={() =>
                  Alert.alert(
                    'Apagar esta dica?',
                    'Ela some para os membros, e a imagem é apagada junto.',
                    [
                      { text: 'Voltar', style: 'cancel' },
                      { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate() },
                    ],
                  )
                }
              >
                Apagar
              </Button>
            </>
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
