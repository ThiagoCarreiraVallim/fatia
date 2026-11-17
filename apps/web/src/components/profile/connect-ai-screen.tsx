'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AI_PROVIDER_OPTIONS,
  CONNECT_AI_TUTORIAL_ID,
  CONNECT_PRIVACY_NOTE,
  CONNECTED_EXAMPLE,
  connectedFootnote,
  connectedTitle,
  connectionFor,
  connectSteps,
  failureChecks,
  initialProvider,
  mcpConnectionsApi,
  NO_MCP_BODY,
  NO_MCP_TITLE,
  usersApi,
  VERIFY_HINT,
  VERIFY_PROMPT,
  type AiProvider,
} from '@fatia/api-client';
import { useAiMenu } from '@/components/layout/ai-menu';
import { useExportData } from '@/components/you/use-export-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/** O que fica no lugar do teste: a prancha troca um pelo outro (Al-V6b, tweak `stt`). */
type Panel = 'test' | 'fail' | 'no-mcp';

/**
 * Conectar sua IA (pranchas Al-V6 a Al-V6e, #388). A pessoa escolhe a IA, segue
 * os passos, copia o endereço (que vem da API, da configuração do servidor) e
 * testa com uma pergunta. Quando o servidor já viu a conexão daquela IA, um
 * cartão diz "Conectado", com o último acesso (ou "conectado antes", sem uso há
 * mais de 30 dias). O teste e o "Não funcionou?" ficam sempre embaixo: o Fatia
 * não sabe se a pessoa removeu o conector na IA (revisão da #388; a prancha
 * Al-V6c troca o teste pelo cartão). Não há "desconectar" aqui: o Fatia não
 * revoga o acesso, então o texto manda remover o conector na IA.
 */
export function ConnectAiScreen() {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  // Volta da aba do Claude ou do ChatGPT direto para cá: o foco busca de novo,
  // e o "Conectado" aparece sem recarregar a página.
  const mcp = useQuery({
    queryKey: ['users', 'me', 'mcp-connections'],
    queryFn: () => mcpConnectionsApi.overview(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const ai = useAiMenu();
  const exportData = useExportData();

  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [openStep, setOpenStep] = useState(0);
  const [panel, setPanel] = useState<Panel>('test');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (copyTimer.current && clearTimeout(copyTimer.current)), []);

  const connections = mcp.data?.connections ?? [];
  // Até a pessoa escolher, a tela fica na IA que ela usou por último.
  const current = provider ?? initialProvider(connections);
  const email = me.data?.email ?? null;
  const serverUrl = mcp.data?.serverUrl ?? null;
  const steps = connectSteps(current, email);
  const status = connectionFor(current, connections);

  const pick = (next: AiProvider) => {
    setProvider(next);
    setOpenStep(0);
    setPanel('test');
    setCopy('idle');
  };

  async function copyAddress() {
    if (!serverUrl) return;
    try {
      await navigator.clipboard.writeText(serverUrl);
      setCopy('copied');
      // Copiou: o próximo passo é entrar e autorizar, com o e-mail desta conta.
      setOpenStep(steps.length - 1);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopy('idle'), 2500);
    } catch {
      // Fora de contexto seguro (http na rede local, comum em self-host) ou sem
      // permissão, o navegador recusa. Sem aviso, o toque não faria nada.
      setCopy('failed');
    }
  }

  return (
    <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4">
      <div className="flex items-center gap-2">
        <Badge variant="done">grátis</Badge>
        <span className="text-[12px] text-faint">
          Funciona no Claude, no ChatGPT e em outros apps com MCP
        </span>
      </div>

      <h1 className="font-display text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
        Registre e consulte conversando com a sua IA
      </h1>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] text-faint" aria-hidden="true">
          Qual IA você usa?
        </span>
        <Segmented
          label="Qual IA você usa?"
          options={AI_PROVIDER_OPTIONS}
          value={current}
          onChange={pick}
        />
      </div>

      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const open = i === openStep;
          return (
            <li key={step.title}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenStep(i)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-card bg-card px-[18px] py-4 text-left',
                  open && 'shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.45)]',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold',
                    i <= openStep
                      ? 'bg-primary/15 text-primary-text'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
                  <b className="text-[15px] text-foreground">{step.title}</b>
                  {open && (
                    <span className="text-[13px] leading-snug text-muted-foreground">
                      {step.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-[14px] bg-card py-1.5 pl-4 pr-1.5 shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          <code
            className={cn(
              'min-w-0 flex-1 text-[13px] text-primary-text',
              copy === 'failed' ? 'break-all' : 'truncate',
            )}
          >
            {serverUrl ?? '…'}
          </code>
          <Button
            type="button"
            size="xs"
            disabled={!serverUrl}
            onClick={() => void copyAddress()}
            aria-label={copy === 'copied' ? 'Endereço copiado' : 'Copiar endereço'}
          >
            <Icon name={copy === 'copied' ? 'check' : 'layers'} size={16} />
            {copy === 'copied' ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        {copy === 'failed' && (
          <p role="status" className="text-[13px] text-muted-foreground">
            Seu navegador não deixou copiar. Selecione o endereço acima e copie à mão.
          </p>
        )}
        {mcp.isError && (
          <p role="status" className="text-[13px] text-muted-foreground">
            Não deu para carregar o endereço. Tente de novo em instantes.
          </p>
        )}
      </div>

      {status && (
        <section
          aria-label={connectedTitle(current, status.connection, status.recent)}
          className={cn(
            'flex flex-col gap-2.5 rounded-card p-5',
            status.recent
              ? 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]'
              : 'bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2',
              status.recent ? 'text-primary-text' : 'text-muted-foreground',
            )}
          >
            <Icon name={status.recent ? 'check' : 'info'} size={16} />
            <b className="text-[15px] text-foreground">
              {connectedTitle(current, status.connection, status.recent)}
            </b>
          </div>
          <p className="text-[12px] text-faint">
            {connectedFootnote(status.connection.lastUsedAt, new Date(), status.recent)}
          </p>
        </section>
      )}

      {panel === 'test' ? (
        <>
          <div className="flex flex-col gap-1.5 rounded-card bg-muted px-[18px] py-4">
            <b className="text-[15px] text-foreground">Teste: “{VERIFY_PROMPT}”</b>
            {status?.recent ? (
              <span className="text-[13px] text-muted-foreground">
                Ele responde algo como: <span className="text-foreground">{CONNECTED_EXAMPLE}</span>
              </span>
            ) : (
              <span className="text-[12px] text-faint">{VERIFY_HINT}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPanel('fail')}
            className="self-start text-[14px] font-bold text-primary-text underline-offset-4 hover:underline"
          >
            Não funcionou?
          </button>
        </>
      ) : panel === 'fail' ? (
        <section
          aria-label="Não funcionou"
          className="flex flex-col gap-2.5 rounded-card bg-card p-5 shadow-[inset_0_0_0_1px_hsl(var(--warning)/0.45)]"
        >
          <PanelHeader icon="alert" tone="text-warning" title="Não funcionou" onClose={setPanel} />
          <ul className="flex flex-col gap-2">
            {failureChecks(current, serverUrl ?? '', email).map((check) => (
              <li key={check} className="flex gap-2 text-[13px] text-foreground">
                <span aria-hidden="true">•</span>
                <span className="min-w-0 break-words">{check}</span>
              </li>
            ))}
          </ul>
          <Button
            asChild
            variant="secondary"
            size="lg"
            full
            className="bg-muted hover:bg-surface-3"
          >
            <Link href={`/you/help?tutorial=${CONNECT_AI_TUTORIAL_ID}`}>Ver o tutorial</Link>
          </Button>
          <button
            type="button"
            onClick={() => setPanel('no-mcp')}
            className="self-center text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Meu app não aceita MCP
          </button>
        </section>
      ) : (
        <section
          aria-label={NO_MCP_TITLE}
          className="flex flex-col gap-2.5 rounded-card bg-card p-5"
        >
          <PanelHeader
            icon="info"
            tone="text-muted-foreground"
            title={NO_MCP_TITLE}
            onClose={setPanel}
          />
          <p className="text-[13px] text-muted-foreground">{NO_MCP_BODY}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1 bg-muted hover:bg-surface-3"
              onClick={ai.open}
            >
              Usar a IA do Fatia
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate()}
            >
              {exportData.isPending ? 'Preparando…' : 'Exportar dados'}
            </Button>
          </div>
        </section>
      )}

      <p className="text-[12px] text-faint">{CONNECT_PRIVACY_NOTE}</p>
    </div>
  );
}

function PanelHeader({
  icon,
  tone,
  title,
  onClose,
}: {
  icon: 'alert' | 'info';
  tone: string;
  title: string;
  onClose: (panel: Panel) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={16} className={tone} />
      <b className="flex-1 text-[15px] text-foreground">{title}</b>
      <button
        type="button"
        aria-label="Voltar ao teste"
        onClick={() => onClose('test')}
        className="-m-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
