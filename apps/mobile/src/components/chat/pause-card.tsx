import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Globe, HelpCircle, Layers, PencilLine, Clock } from 'lucide-react-native';
import {
  AI_CONSENT_TEXTS,
  aiConsentBody,
  pauseDecisionCount,
  webConsentToSaveOnSend,
  askFieldsOf,
  isDestructiveChatTool,
  previewChatAction,
  questionAnswer,
  WEB_SEARCH_CONSENT_FOOTNOTE,
  type ChatAskField,
  type ChatConfirmAction,
  type ChatInterruptValue,
  type ChatQuestionAction,
  type ChatResumeValue,
  type ChatWebConsentAction,
} from '@fatia/api-client';
import { useAcceptAiConsent, useAiConsent } from '@/chat/ai-consent';
import { useChatToolCatalog } from './artifact-card';
import { Button, cn } from '@/components/ui';
import { colors } from '@/theme/colors';

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
        accessibilityLabel={pausa.prompt}
        className="gap-3 rounded-2xl border border-primary/60 bg-card p-3.5"
      >
        <Cabecalho
          icone={<Clock size={18} color={colors.primaryText} />}
          acima="Pausa"
          titulo="Está mais longo que o previsto"
        />
        {pausa.prompt ? <Text className="text-sm text-foreground/75">{pausa.prompt}</Text> : null}
        {pausa.summary ? (
          <Text className="text-xs text-muted-foreground">{pausa.summary}</Text>
        ) : null}
        <View className="flex-row gap-2">
          <Button
            variant="ink"
            className="flex-1"
            disabled={ocupado}
            onPress={() => onResponder(true)}
          >
            <Text className="text-sm font-bold text-background">Continuar</Text>
          </Button>
          <Button variant="secondary" disabled={ocupado} onPress={() => onResponder(false)}>
            <Text className="text-sm font-semibold text-secondary-foreground">Parar aqui</Text>
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
  const buscas = useMemo(
    () => pausa.actions.filter((a): a is ChatWebConsentAction => a.kind === 'web_consent'),
    [pausa.actions],
  );
  const [decisoes, setDecisoes] = useState<Record<string, boolean>>({});
  const [respostas, setRespostas] = useState<Record<string, Record<string, string>>>({});
  const aceites = useAiConsent().data;
  const aceitar = useAcceptAiConsent();
  const [aceiteFalhou, setAceiteFalhou] = useState(false);
  const soUmaEscrita = escritas.length + buscas.length === 1 && perguntas.length === 0;
  // A busca conta como decisão: escrita + busca já é lote.
  const decisoesNoLote = pauseDecisionCount(pausa.actions);
  const emLote = decisoesNoLote > 1;
  const soPergunta = perguntas.length > 0 && escritas.length + buscas.length === 0;

  const faltaDecidir = [...escritas, ...buscas].some((a) => decisoes[a.toolCallId] === undefined);
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

  // No lote, o aceite da busca é gravado aqui, com a escolha final; sem ele, nada sai.
  const enviarLote = async () => {
    if (webConsentToSaveOnSend(pausa.actions, decisoes, aceites?.webSearch.accepted === true)) {
      setAceiteFalhou(false);
      try {
        await aceitar.mutateAsync('web_search');
      } catch {
        setAceiteFalhou(true);
        return;
      }
    }
    enviar();
  };

  const decidir = (id: string) => (aprovada: boolean) => {
    if (soUmaEscrita) enviar({ [id]: aprovada });
    else setDecisoes((d) => ({ ...d, [id]: aprovada }));
  };

  // A escrita ou a busca sozinhas são o próprio cartão, sem moldura em volta.
  if (soUmaEscrita && escritas[0]) {
    return (
      <Escrita
        acao={escritas[0]}
        decisao={undefined}
        ocupado={ocupado}
        emLote={false}
        onDecidir={decidir(escritas[0].toolCallId)}
      />
    );
  }
  if (soUmaEscrita && buscas[0]) {
    return (
      <AceiteDaBusca acao={buscas[0]} ocupado={ocupado} onDecidir={decidir(buscas[0].toolCallId)} />
    );
  }

  return (
    <View
      className={cn(
        'gap-3 rounded-2xl border bg-card p-3.5',
        soPergunta ? 'border-info/60' : 'border-primary/60',
      )}
    >
      {emLote ? (
        <Cabecalho
          icone={<Layers size={18} color={colors.primaryText} />}
          acima="Lote"
          titulo={`${decisoesNoLote} ações para decidir`}
        />
      ) : perguntas.length ? (
        <Cabecalho
          icone={<HelpCircle size={18} color={colors.info} />}
          acima="Pergunta"
          titulo={pausa.prompt || 'Pergunta do assistente'}
          pergunta
        />
      ) : null}
      {buscas.map((acao) => (
        <AceiteDaBusca
          key={acao.toolCallId}
          acao={acao}
          ocupado={ocupado}
          emLote
          decisao={decisoes[acao.toolCallId]}
          onDecidir={decidir(acao.toolCallId)}
        />
      ))}
      {escritas.map((acao) => (
        <Escrita
          key={acao.toolCallId}
          acao={acao}
          decisao={decisoes[acao.toolCallId]}
          ocupado={ocupado}
          emLote
          onDecidir={decidir(acao.toolCallId)}
        />
      ))}
      {perguntas.map((acao) => (
        <Pergunta
          key={acao.toolCallId}
          acao={acao}
          // O cabeçalho já mostra a pergunta quando ela é a única coisa do cartão.
          semEnunciado={soPergunta && acao.prompt === pausa.prompt}
          valores={respostas[acao.toolCallId] ?? {}}
          onMudar={(nome, valor) =>
            setRespostas((r) => ({
              ...r,
              [acao.toolCallId]: { ...r[acao.toolCallId], [nome]: valor },
            }))
          }
        />
      ))}
      {aceiteFalhou ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          Não consegui gravar o aceite da busca. Tente de novo.
        </Text>
      ) : null}
      {soUmaEscrita ? null : (
        <Button
          variant="ink"
          disabled={ocupado || faltaDecidir || faltaResponder || aceitar.isPending}
          onPress={() => void enviarLote()}
        >
          <Text className="text-sm font-bold text-background">
            {emLote ? `Enviar ${decisoesNoLote} decisões` : 'Responder'}
          </Text>
        </Button>
      )}
    </View>
  );
}

function Cabecalho({
  icone,
  acima,
  titulo,
  perigo = false,
  pergunta = false,
}: {
  icone: ReactNode;
  acima: string;
  titulo: string;
  perigo?: boolean;
  /** A pergunta do assistente sai em azul, para não se confundir com uma escrita. */
  pergunta?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View
        className={cn(
          'size-9 items-center justify-center rounded-xl',
          perigo ? 'bg-danger/15' : pergunta ? 'bg-info/15' : 'bg-primary/15',
        )}
      >
        {icone}
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {acima}
        </Text>
        <Text accessibilityRole="header" className="text-[15px] font-bold text-foreground">
          {titulo}
        </Text>
      </View>
    </View>
  );
}

/**
 * Uma escrita à espera do sim (prancha IA-Cartoes): Gravar e Ajustar. Ajustar recusa — nada é
 * gravado — e a pessoa diz no campo o que mudar. Inválida, o cartão fica vermelho e só ajusta.
 */
function Escrita({
  acao,
  decisao,
  ocupado,
  emLote,
  onDecidir,
}: {
  acao: ChatConfirmAction;
  decisao: boolean | undefined;
  ocupado: boolean;
  emLote: boolean;
  onDecidir: (aprovada: boolean) => void;
}) {
  const previa = useQuery({
    queryKey: ['chat', 'preview', acao.toolCallId],
    queryFn: () => previewChatAction(acao.tool, acao.arguments),
    staleTime: Infinity,
    retry: 1,
  });
  // Gravar antes de ler o resumo seria aprovar às cegas.
  const invalida = previa.data?.valida === false;
  // Exclusão só com o registro nomeado (ADR 051): sem a prévia, não há o que confirmar.
  const exclusao = isDestructiveChatTool(useChatToolCatalog(), acao.tool);
  const travado = previa.isPending || invalida || (exclusao && previa.isError);
  return (
    <View
      className={cn(
        'gap-3 rounded-2xl p-3.5',
        emLote ? 'bg-secondary' : 'border bg-card',
        !emLote && (invalida ? 'border-danger/50' : 'border-primary/60'),
      )}
    >
      <Cabecalho
        icone={
          invalida ? (
            <AlertCircle size={18} color={colors.danger} />
          ) : (
            <PencilLine size={18} color={colors.primaryText} />
          )
        }
        acima={acao.title}
        titulo={
          invalida
            ? exclusao
              ? 'Não dá para excluir assim'
              : 'Não dá para gravar assim'
            : exclusao
              ? 'Confere antes de excluir'
              : 'Confere antes de gravar'
        }
        perigo={invalida || exclusao}
      />
      {previa.isPending ? (
        <Text className="text-xs text-muted-foreground">Preparando o resumo…</Text>
      ) : previa.isError ? (
        <Text className="text-xs text-muted-foreground">
          {exclusao
            ? 'Não consegui mostrar o que vai ser excluído. Toque em Ajustar e peça de novo.'
            : 'Não consegui mostrar os detalhes. Se tiver dúvida, toque em Ajustar e peça de novo.'}
        </Text>
      ) : previa.data.valida === false ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {previa.data.problema}
        </Text>
      ) : previa.data.linhas.length ? (
        <View className="rounded-xl bg-secondary px-3">
          {previa.data.linhas.map((l, i) => (
            <View
              key={`${l.rotulo}-${i}`}
              className={cn('flex-row gap-3 py-2', i > 0 && 'border-t border-border')}
            >
              <Text className="text-sm text-muted-foreground">{l.rotulo}</Text>
              <Text className="flex-1 text-right text-sm font-semibold text-foreground">
                {l.valor}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        {invalida ? null : (
          <Button
            disabled={ocupado || travado}
            onPress={() => onDecidir(true)}
            variant="ink"
            className={cn('flex-1', decisao === false && 'opacity-40')}
            accessibilityState={{ selected: decisao === true, disabled: ocupado || travado }}
          >
            <Text className="text-sm font-bold text-background">
              {exclusao ? 'Excluir' : 'Gravar'}
            </Text>
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={ocupado}
          onPress={() => onDecidir(false)}
          // No lote o cartão já é cinza: o Ajustar sobe um tom para não sumir nele.
          className={cn(
            invalida && 'flex-1',
            emLote && 'bg-card',
            decisao === true && 'opacity-40',
          )}
          accessibilityHint={
            exclusao
              ? 'Não exclui. Diga no campo o que mudar.'
              : 'Não grava. Diga no campo o que mudar.'
          }
          accessibilityState={{ selected: decisao === false, disabled: ocupado }}
        >
          <Text className="text-sm font-semibold text-secondary-foreground">Ajustar</Text>
        </Button>
      </View>
    </View>
  );
}

/** O aceite da busca na web com a pergunta à vista; concordar grava o aceite e busca. */
/**
 * Sozinho, concordar grava o aceite (se ainda não havia) e libera a busca. No lote, tocar só
 * escolhe e mostra a escolha; o aceite é gravado no "Enviar" do lote.
 */
function AceiteDaBusca({
  acao,
  ocupado,
  onDecidir,
  emLote = false,
  decisao,
}: {
  acao: ChatWebConsentAction;
  ocupado: boolean;
  onDecidir: (aprovada: boolean) => void;
  emLote?: boolean;
  decisao?: boolean;
}) {
  const textos = AI_CONSENT_TEXTS.webSearch;
  const aceites = useAiConsent().data;
  const aceitar = useAcceptAiConsent();
  const [falhou, setFalhou] = useState(false);
  return (
    <View
      accessibilityLabel={textos.title}
      className="gap-3 rounded-2xl border border-primary/60 bg-card p-3.5"
    >
      <Cabecalho
        icone={<Globe size={18} color={colors.primaryText} />}
        acima="Buscar na web"
        titulo={textos.title}
      />
      {acao.query ? (
        <Text className="rounded-xl bg-secondary px-3 py-2 text-sm text-foreground">
          Vou buscar: “{acao.query}”
        </Text>
      ) : null}
      <Text className="text-xs leading-5 text-muted-foreground">
        {aceites?.processor
          ? aiConsentBody('web_search', aceites.processor)
          : 'Carregando o aviso…'}
      </Text>
      {falhou ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          Não consegui gravar o aceite. Tente de novo.
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          accessibilityState={emLote ? { selected: decisao === true } : undefined}
          className={cn('flex-1', decisao === false && 'opacity-40')}
          disabled={ocupado || aceitar.isPending || !aceites?.processor}
          onPress={async () => {
            if (emLote) {
              onDecidir(true);
              return;
            }
            setFalhou(false);
            if (!aceites?.webSearch.accepted) {
              try {
                await aceitar.mutateAsync('web_search');
              } catch {
                setFalhou(true);
                return;
              }
            }
            onDecidir(true);
          }}
        >
          <Text className="text-sm font-bold text-primary-foreground">{textos.accept}</Text>
        </Button>
        <Button
          variant="secondary"
          accessibilityState={emLote ? { selected: decisao === false } : undefined}
          className={cn(decisao === true && 'opacity-40')}
          disabled={ocupado}
          onPress={() => onDecidir(false)}
        >
          <Text className="text-sm font-semibold text-secondary-foreground">{textos.decline}</Text>
        </Button>
      </View>
      <Text className="text-[11px] text-muted-foreground">{WEB_SEARCH_CONSENT_FOOTNOTE}</Text>
    </View>
  );
}

function Pergunta({
  acao,
  valores,
  onMudar,
  semEnunciado = false,
}: {
  acao: ChatQuestionAction;
  valores: Record<string, string>;
  onMudar: (nome: string, valor: string) => void;
  semEnunciado?: boolean;
}) {
  return (
    <View className={cn('gap-3', !semEnunciado && 'rounded-lg border border-border p-3')}>
      {semEnunciado ? null : (
        <Text className="text-sm font-semibold text-foreground">{acao.prompt}</Text>
      )}
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
                valor === o ? 'border-primary bg-primary' : 'border-transparent bg-secondary',
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
          placeholderTextColor={colors.mutedForeground}
          className="min-h-[44px] rounded-lg border border-border px-3 text-[15px] text-foreground"
        />
      )}
    </View>
  );
}
