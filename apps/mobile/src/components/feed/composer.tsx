import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import {
  displayNameProblem,
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
import type { ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { PhotosField } from '@/components/content/photos-field';
import { apiMessage } from '@/components/org/org-panel';
import { Button, Input, Segmented, Switch } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { feedKey, NicknameField, type MyName } from './feed-ui';

const POLL_DAYS = [
  { value: '1', label: '1 dia' },
  { value: '3', label: '3 dias' },
  { value: '7', label: '1 semana' },
];
/** O aviso fixado pelo composer sai do topo sozinho; o painel escolhe outro prazo. */
const COMPOSER_PIN_DAYS = 7;

/** A barra de formatação: no app, a marcação entra no fim do texto (como na prancha). */
const TOOLS: { label: string; aria: string; insert: string; line?: boolean }[] = [
  { label: 'B', aria: 'Negrito', insert: '**texto**' },
  { label: 'I', aria: 'Itálico', insert: '_texto_' },
  { label: 'T', aria: 'Título', insert: '# ', line: true },
  { label: 'Lista', aria: 'Item de lista', insert: '- ', line: true },
  { label: 'Citação', aria: 'Citação', insert: '> ', line: true },
  { label: 'Link', aria: 'Link', insert: '[texto](https://)' },
];

/**
 * Escrever no mural (pranchas Cm-06 e Cm-06b) — equivalente de
 * `apps/web/src/components/feed/composer.tsx`: post com Markdown e até 4
 * imagens, ou enquete; a equipe publica em nome da comunidade e fixa como aviso.
 */
export function Composer({
  groupId,
  me,
  team,
}: {
  groupId: string;
  me: MyName;
  team?: { groupName: string } | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tipo, setTipo] = useState<'POST' | 'POLL'>('POST');
  const [vista, setVista] = useState<'write' | 'preview'>('write');
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<ImageValue[]>([]);
  const [apelido, setApelido] = useState(me.suggested);
  const [pergunta, setPergunta] = useState('');
  const [opcoes, setOpcoes] = useState<string[]>(['', '']);
  const [dias, setDias] = useState('3');
  const [comoGrupo, setComoGrupo] = useState<'me' | 'group'>('me');
  const [fixar, setFixar] = useState(false);

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
      if (!me.displayName) input.displayName = apelido.trim();
      if (team) {
        if (comoGrupo === 'group') input.publishedAs = 'GROUP';
        if (fixar) {
          input.pin = true;
          input.pinDays = COMPOSER_PIN_DAYS;
        }
      }
      return feedApi.create(groupId, input);
    },
    onSuccess: () => {
      setTexto('');
      setImagens([]);
      setPergunta('');
      setOpcoes(['', '']);
      setFixar(false);
      setVista('write');
      toast.show({
        message: tipo === 'POLL' ? 'Enquete publicada no mural.' : 'Publicado no mural.',
      });
      void qc.invalidateQueries({ queryKey: feedKey(groupId) });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para publicar agora.') }),
  });

  const problema =
    (tipo === 'POLL' ? pollProblem(pergunta, opcoes) : postProblem(texto, imagens.length)) ??
    (me.displayName ? null : displayNameProblem(apelido));
  const escreveu =
    tipo === 'POLL'
      ? pergunta.trim().length > 0 || opcoes.some((o) => o.trim())
      : texto.trim().length > 0 || imagens.length > 0;
  const inserir = (t: (typeof TOOLS)[number]) => {
    const quebra = t.line && texto && !texto.endsWith('\n') ? '\n' : '';
    setTexto(`${texto}${quebra}${t.insert}`.slice(0, POST_BODY_MAX));
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      {team ? (
        <Segmented
          label="Publicar como"
          value={comoGrupo}
          options={[
            { value: 'me', label: me.displayName ? `Eu, ${me.displayName}` : 'Eu' },
            { value: 'group', label: team.groupName },
          ]}
          onChange={setComoGrupo}
        />
      ) : null}
      <Segmented
        label="Tipo"
        value={tipo}
        options={[
          { value: 'POST', label: 'Post' },
          { value: 'POLL', label: 'Enquete' },
        ]}
        onChange={setTipo}
      />

      {tipo === 'POLL' ? (
        <View className="gap-2">
          <Input
            value={pergunta}
            onChangeText={setPergunta}
            maxLength={POLL_QUESTION_MAX}
            accessibilityLabel="Pergunta"
            placeholder="Pergunta"
          />
          <Text className="text-xs font-semibold text-muted-foreground">
            {`Opções · até ${POLL_MAX_OPTIONS}`}
          </Text>
          {opcoes.map((o, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <View className="flex-1">
                <Input
                  value={o}
                  onChangeText={(v) => setOpcoes(opcoes.map((x, j) => (j === i ? v : x)))}
                  maxLength={POLL_OPTION_MAX}
                  accessibilityLabel={`Opção ${i + 1}`}
                  placeholder="Opção"
                />
              </View>
              {opcoes.length > 2 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tirar a opção ${i + 1}`}
                  onPress={() => setOpcoes(opcoes.filter((_, j) => j !== i))}
                  className="min-h-[44px] min-w-[44px] items-center justify-center"
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {opcoes.length < POLL_MAX_OPTIONS ? (
            <Button size="sm" variant="ghost" onPress={() => setOpcoes([...opcoes, ''])}>
              Adicionar opção
            </Button>
          ) : null}
          <Segmented label="Fecha em" value={dias} options={POLL_DAYS} onChange={setDias} />
          <Text className="text-xs text-muted-foreground">
            {`O voto de cada pessoa não aparece. O resultado só mostra com ${POLL_MIN_VOTES} votos ou mais.`}
          </Text>
        </View>
      ) : null}

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
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-1" accessibilityLabel="Formatação">
            {TOOLS.map((t) => (
              <Pressable
                key={t.label}
                accessibilityRole="button"
                accessibilityLabel={t.aria}
                onPress={() => inserir(t)}
                className="min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-border px-2"
              >
                <Text className="text-xs text-foreground">{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Input
            value={texto}
            onChangeText={setTexto}
            maxLength={POST_BODY_MAX}
            multiline
            className="min-h-[80px]"
            textAlignVertical="top"
            accessibilityLabel={
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
          <Text className="text-xs text-muted-foreground">
            Aceita Markdown: **negrito**, _itálico_, # título, - lista, &gt; citação e
            [texto](link).
          </Text>
        </View>
      ) : (
        <View
          accessibilityLabel="Prévia do post"
          className="min-h-[72px] rounded-xl border border-dashed border-border p-3"
        >
          {texto.trim() ? (
            <MarkdownLite source={texto} />
          ) : (
            <Text className="text-sm text-muted-foreground">Nada para mostrar ainda.</Text>
          )}
        </View>
      )}

      {tipo === 'POST' ? (
        <PhotosField
          groupId={groupId}
          value={imagens}
          onChange={setImagens}
          purpose="post_image"
          max={POST_MAX_IMAGES}
          label={`Imagens (até ${POST_MAX_IMAGES})`}
          addLabel="Adicionar imagens"
        />
      ) : null}

      {team ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">Fixar como aviso</Text>
            <Text className="text-xs text-muted-foreground">
              {`Entra no carrossel do topo do mural por ${COMPOSER_PIN_DAYS} dias`}
            </Text>
          </View>
          <Switch checked={fixar} onCheckedChange={setFixar} label="Fixar como aviso" />
        </View>
      ) : null}

      {!me.displayName && escreveu ? <NicknameField value={apelido} onChange={setApelido} /> : null}
      {problema && escreveu ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {problema}
        </Text>
      ) : null}
      <Button
        disabled={Boolean(problema)}
        loading={publicar.isPending}
        onPress={() => publicar.mutate()}
      >
        Publicar
      </Button>
    </View>
  );
}
