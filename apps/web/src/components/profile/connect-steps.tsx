import { CopyLine } from './copy-line';

/**
 * Os passos para conectar a IA do usuário ao Fatia (issue #164).
 *
 * O texto é o porte do que já está publicado em `apps/site/src/pages/claude-connect.astro` — a
 * mesma ordem e as mesmas palavras. Reescrever criaria mais uma versão da mesma instrução: o app
 * chegou a ter quatro superfícies de conexão com três textos diferentes, e uma delas mandava
 * colar um endereço que não existia.
 *
 * Duas diferenças, ambas porque aqui o leitor já tem conta: o passo "crie sua conta" da landing
 * sai, e entra o passo 5 de verificação, que lá não faria sentido (não há diário para consultar).
 *
 * **Sem jargão.** Quem quer conectar não precisa saber o que é MCP, OAuth ou registro dinâmico de
 * cliente. A única exceção é o que está escrito na tela do Claude — "Settings", "Connectors",
 * "Add custom connector" —, porque o passo tem de usar as palavras que o usuário vai procurar; em
 * português ele não acha o botão.
 */

/**
 * A pergunta que prova a conexão: passa por uma tool de leitura e devolve dado do próprio dia.
 *
 * A issue pede um **botão** de verificação no app. Ele fica pendente e o motivo não é de desenho:
 * detectar do lado de cá que o Claude já chamou o servidor exige persistir o último uso por
 * usuário, e a migration desta rodada é de outra trilha — inventar uma segunda aqui seria conflito
 * garantido. O caminho manual não é só um paliativo: a resposta que o usuário lê é o próprio
 * diário dele, o que verifica a conexão de ponta a ponta — inclusive se o modelo consegue mesmo
 * chamar a tool, que um botão do lado do servidor não teria como confirmar.
 */
export const VERIFY_PROMPT = 'Qual é meu resumo de hoje?';

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
        aria-hidden="true"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="text-base font-bold leading-tight text-foreground">{title}</h3>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

export function ConnectSteps({
  serverUrl,
  accountEmail,
}: {
  serverUrl: string;
  accountEmail?: string;
}) {
  return (
    <ol className="space-y-6">
      <Step number={1} title="No Claude, abra Settings → Connectors">
        <p>
          Está em inglês na tela dele, então procure por essas palavras mesmo. Vale no site e no
          aplicativo do computador.
        </p>
      </Step>

      <Step number={2} title="Clique em “Add custom connector”">
        <p>Ele vai pedir um nome e um endereço. O nome é seu — “Fatia” resolve.</p>
      </Step>

      <Step number={3} title="Cole o endereço do Fatia">
        <CopyLine value={serverUrl} copyLabel="Copiar endereço do Fatia" />
        <p>Só isso. Sem código, sem senha e sem nada para guardar depois.</p>
      </Step>

      <Step number={4} title="Entre e autorize">
        <p>
          O Claude abre a tela de login do Fatia. Você entra, autoriza e volta para a conversa já
          conectado.
        </p>
        <p>
          {accountEmail ? (
            <>
              Entre com <strong className="text-foreground">{accountEmail}</strong> — é esta conta
              que tem os seus dados.
            </>
          ) : (
            <>Entre com a mesma conta que você usa aqui — é ela que tem os seus dados.</>
          )}
        </p>
      </Step>

      <Step number={5} title="Veja se funcionou">
        <p>Volte para a conversa e mande esta pergunta:</p>
        <CopyLine value={VERIFY_PROMPT} copyLabel="Copiar pergunta" wrap />
        <p>
          Se ele responder com os seus números de hoje — o que você comeu, quanto bebeu, o treino —
          está conectado. Na primeira vez ele pode pedir sua permissão para usar o Fatia; é só
          confirmar.
        </p>
      </Step>
    </ol>
  );
}
