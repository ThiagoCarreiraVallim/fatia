import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, PlayCircle } from 'lucide-react-native';
import {
  askFieldsOf,
  previewChatAction,
  questionAnswer,
  type ChatAskField,
  type ChatConfirmAction,
  type ChatInterruptValue,
  type ChatQuestionAction,
  type ChatResumeValue,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/**
 * A pausa do agente no fim da conversa (ADR 023), como na web (`ask-user.tsx`):
 * aprovar uma escrita, responder uma pergunta ou deixar continuar. Uma escrita
 * sozinha responde no toque; com mais de uma coisa, a pessoa decide cada uma e
 * envia no fim.
 */
export function PauseCard({
  pausa,
  ocupado,
  onResponder,
}: {
  pausa: ChatInterruptValue;
  ocupado: boolean;
  onResponder: (valor: ChatResumeValue) => void;
}) {
  if (pausa.kind === 'continue') {
    return (
      <View
        accessibilityRole="summary"
        className="gap-3 rounded-xl border border-border bg-card p-4"
      >
        <View className="flex-row items-center gap-2">
          <PlayCircle size={16} color={cores.primary} />
          <Text className="flex-1 text-sm font-semibold text-foreground">{pausa.prompt}</Text>
        </View>
        {pausa.summary ? (
          <Text className="text-xs text-muted-foreground">{pausa.summary}</Text>
        ) : null}
        <View className="flex-row gap-2">
          <Button size="sm" disabled={ocupado} onPress={() => onResponder(true)}>
            <Text className="text-sm font-bold text-primary-foreground">Continuar</Text>
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onPress={() => onResponder(false)}>
            <Text className="text-sm text-foreground">Parar por aqui</Text>
          </Button>
        </View>
      </View>
    );
  }
  return <Acoes pausa={pausa} ocupado={ocupado} onResponder={onResponder} />;
}

function Acoes({
  pausa,
  ocupado,
  onResponder,
}: {
  pausa: ChatInterruptValue;
  ocupado: boolean;
  onResponder: (valor: ChatResumeValue) => void;
}) {
  const escritas = useMemo(
    () => pausa.actions.filter((a): a is ChatConfirmAction => a.kind === 'confirm'),
    [pausa.actions],
  );
  const perguntas = useMemo(
    () => pausa.actions.filter((a): a is ChatQuestionAction => a.kind === 'question'),
    [pausa.actions],
  );
  const [decisoes, setDecisoes] = useState<Record<string, boolean>>({});
  const [respostas, setRespostas] = useState<Record<string, Record<string, string>>>({});
  const soUmaEscrita = escritas.length === 1 && perguntas.length === 0;

  const faltaDecidir = escritas.some((a) => decisoes[a.toolCallId] === undefined);
  const faltaResponder = perguntas.some((a) =>
    askFieldsOf(a).some(
      (c) =>
        (c.required || c.name === '__livre') && !(respostas[a.toolCallId]?.[c.name] ?? '').trim(),
    ),
  );

  const enviar = (extra: Record<string, boolean> = {}) =>
    onResponder({
      approvals: { ...decisoes, ...extra },
      answers: Object.fromEntries(
        perguntas.map((a) => [
          a.toolCallId,
          questionAnswer(askFieldsOf(a), respostas[a.toolCallId] ?? {}),
        ]),
      ),
    });

  const titulo =
    escritas.length > 1
      ? `${escritas.length} ações aguardando confirmação`
      : escritas.length === 1
        ? 'Ação aguardando confirmação'
        : 'Pergunta do assistente';

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        {escritas.length ? (
          <AlertTriangle size={16} color={cores.primary} />
        ) : (
          <HelpCircle size={16} color={cores.primary} />
        )}
        <Text accessibilityRole="header" className="flex-1 text-sm font-semibold text-foreground">
          {titulo}
        </Text>
      </View>
      {pausa.prompt ? <Text className="text-sm text-muted-foreground">{pausa.prompt}</Text> : null}
      {escritas.map((acao) => (
        <Escrita
          key={acao.toolCallId}
          acao={acao}
          decisao={decisoes[acao.toolCallId]}
          ocupado={ocupado}
          onDecidir={(aprovada) => {
            if (soUmaEscrita) enviar({ [acao.toolCallId]: aprovada });
            else setDecisoes((d) => ({ ...d, [acao.toolCallId]: aprovada }));
          }}
        />
      ))}
      {perguntas.map((acao) => (
        <Pergunta
          key={acao.toolCallId}
          acao={acao}
          valores={respostas[acao.toolCallId] ?? {}}
          onMudar={(nome, valor) =>
            setRespostas((r) => ({
              ...r,
              [acao.toolCallId]: { ...r[acao.toolCallId], [nome]: valor },
            }))
          }
        />
      ))}
      {soUmaEscrita ? null : (
        <Button disabled={ocupado || faltaDecidir || faltaResponder} onPress={() => enviar()}>
          <Text className="text-sm font-bold text-primary-foreground">Enviar</Text>
        </Button>
      )}
    </View>
  );
}

function Escrita({
  acao,
  decisao,
  ocupado,
  onDecidir,
}: {
  acao: ChatConfirmAction;
  decisao: boolean | undefined;
  ocupado: boolean;
  onDecidir: (aprovada: boolean) => void;
}) {
  const previa = useQuery({
    queryKey: ['chat', 'preview', acao.toolCallId],
    queryFn: () => previewChatAction(acao.tool, acao.arguments),
    staleTime: Infinity,
    retry: 1,
  });
  // Confirmar antes de ler o resumo seria aprovar às cegas.
  const travado = previa.isPending || previa.data?.valida === false;
  return (
    <View className="gap-2 rounded-lg border border-border p-3">
      <Text className="text-sm font-semibold text-foreground">{acao.title}</Text>
      {previa.isPending ? (
        <Text className="text-xs text-muted-foreground">Preparando o resumo…</Text>
      ) : previa.isError ? (
        <Text className="text-xs text-muted-foreground">
          Não consegui mostrar os detalhes. Se tiver dúvida, recuse e peça de novo.
        </Text>
      ) : (
        <View className="gap-1">
          {previa.data.linhas.map((l, i) => (
            <View key={`${l.rotulo}-${i}`} className="flex-row gap-2">
              <Text className="text-xs text-muted-foreground">{l.rotulo}</Text>
              <Text className="flex-1 text-xs text-foreground">{l.valor}</Text>
            </View>
          ))}
          {previa.data.valida === false ? (
            <Text accessibilityRole="alert" className="text-xs text-destructive">
              {previa.data.problema}
            </Text>
          ) : null}
        </View>
      )}
      <View className="flex-row gap-2">
        <Button
          size="sm"
          disabled={ocupado || travado}
          onPress={() => onDecidir(true)}
          className={cn(decisao === false && 'opacity-40')}
          accessibilityState={{ selected: decisao === true, disabled: ocupado || travado }}
        >
          <Text className="text-xs font-bold text-primary-foreground">Confirmar</Text>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onPress={() => onDecidir(false)}
          className={cn(decisao === true && 'opacity-40')}
          accessibilityState={{ selected: decisao === false, disabled: ocupado }}
        >
          <Text className="text-xs text-foreground">Recusar</Text>
        </Button>
      </View>
    </View>
  );
}

function Pergunta({
  acao,
  valores,
  onMudar,
}: {
  acao: ChatQuestionAction;
  valores: Record<string, string>;
  onMudar: (nome: string, valor: string) => void;
}) {
  return (
    <View className="gap-3 rounded-lg border border-border p-3">
      <Text className="text-sm font-semibold text-foreground">{acao.prompt}</Text>
      {askFieldsOf(acao).map((campo) => (
        <Campo
          key={campo.name}
          campo={campo}
          valor={valores[campo.name] ?? ''}
          onMudar={(v) => onMudar(campo.name, v)}
        />
      ))}
    </View>
  );
}

function Campo({
  campo,
  valor,
  onMudar,
}: {
  campo: ChatAskField;
  valor: string;
  onMudar: (valor: string) => void;
}) {
  const opcoes =
    campo.type === 'boolean'
      ? ['Sim', 'Não']
      : campo.type === 'select'
        ? (campo.options ?? [])
        : null;
  return (
    <View className="gap-1.5">
      <Text className="text-xs text-muted-foreground">
        {campo.label}
        {campo.required ? ' *' : ''}
      </Text>
      {opcoes ? (
        <View className="flex-row flex-wrap gap-2">
          {opcoes.map((o) => (
            <Pressable
              key={o}
              accessibilityRole="radio"
              accessibilityState={{ checked: valor === o }}
              onPress={() => onMudar(o)}
              className={cn(
                'min-h-[44px] justify-center rounded-full border px-4',
                valor === o ? 'border-primary bg-primary' : 'border-border',
              )}
            >
              <Text
                className={cn(
                  'text-sm',
                  valor === o ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {o}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          accessibilityLabel={campo.label}
          value={valor}
          onChangeText={onMudar}
          keyboardType={campo.type === 'number' ? 'decimal-pad' : 'default'}
          placeholder={campo.type === 'date' ? 'AAAA-MM-DD' : undefined}
          placeholderTextColor={cores.mutedForeground}
          className="min-h-[44px] rounded-lg border border-border px-3 text-[15px] text-foreground"
        />
      )}
    </View>
  );
}
