/**
 * O que fazer quando não funcionou (issue #164).
 *
 * Três causas nomeadas, não uma lista genérica de "verifique sua conexão". São as que
 * efetivamente acontecem, e a terceira — a mais comum — nem é erro: o usuário autorizou e não
 * perguntou nada ainda. Dizer isso poupa a desconexão e a reconexão que não iam resolver.
 */
export function ConnectTroubleshooting({ accountEmail }: { accountEmail?: string }) {
  const items = [
    {
      problem: 'O Claude diz que não conseguiu encontrar o endereço',
      fix: 'Quase sempre é um pedaço faltando ou um espaço a mais. Use o botão de copiar do passo 3 em vez de digitar: assim o endereço vai inteiro, do jeito certo.',
    },
    {
      problem: 'Entrei com outra conta na hora de autorizar',
      fix: accountEmail
        ? `A conta que autoriza precisa ser a mesma daqui (${accountEmail}). Se você entrou com outro e-mail, remova o conector no Claude, adicione de novo e entre com esse.`
        : 'A conta que autoriza precisa ser a mesma que você usa aqui. Se você entrou com outro e-mail, remova o conector no Claude, adicione de novo e entre com o certo.',
    },
    {
      problem: 'Conectou, mas ele diz que não sabe nada sobre mim',
      fix: 'Esse é o caso mais comum e não é erro: ele só olha o seu diário quando você pergunta. Mande a pergunta do passo 5 e veja a resposta.',
    },
  ];

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-4">
      <h2 className="text-base font-bold text-foreground">Não funcionou?</h2>
      <dl className="mt-3 space-y-4">
        {items.map(({ problem, fix }) => (
          <div key={problem}>
            <dt className="text-sm font-semibold text-foreground">{problem}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{fix}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
