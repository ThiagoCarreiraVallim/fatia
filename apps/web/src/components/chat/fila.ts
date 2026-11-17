import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SEM_ITENS: ItemDaFila[] = [];

/**
 * A fila de mensagens: o que a pessoa escreve enquanto o assistente ainda
 * responde. Antes, o envio era recusado em silêncio (`if (rodando) return`) e o
 * texto ficava parado no campo, sem dizer se ia ou não.
 *
 * Fila própria, e não a do assistant-ui (`unstable_enableMessageQueue`): aquela
 * escoa assim que a resposta termina, **mesmo com uma pausa aberta** — a
 * mensagem da fila sairia e abandonaria a confirmação que a pessoa ainda não
 * respondeu, levando junto a escrita que ela segurava (ADR 022). E enviar com
 * resposta em andamento lá, por padrão, cancela a resposta.
 */

export interface ItemDaFila {
  id: string;
  texto: string;
}

/**
 * A fila só anda com a conversa livre: sem resposta correndo, sem pausa
 * esperando a pessoa e com a conversa já aberta.
 */
export function canDrainQueue(estado: {
  rodando: boolean;
  pausado: boolean;
  abrindo: boolean;
  /** "Parar" foi tocado e o servidor ainda fecha o turno: a próxima esbarraria no 409. */
  parando?: boolean;
}) {
  return !estado.rodando && !estado.pausado && !estado.abrindo && !estado.parando;
}

/** O pedaço de mensagem que importa aqui: o papel e o texto. */
interface MensagemDaConversa {
  id: string;
  role: string;
  content: readonly { type: string; text?: string }[];
}

/**
 * A pergunta que "Tentar de novo" reenvia: a que veio antes da resposta que falhou, e não a
 * última da conversa (que pode ser outra, mandada depois). Sem resposta (o erro do turno no
 * fim da conversa), é a última pergunta.
 */
export function failedQuestion(
  mensagens: readonly MensagemDaConversa[],
  respostaQueFalhou?: string,
): string {
  const ate = respostaQueFalhou
    ? mensagens.findIndex((m) => m.id === respostaQueFalhou)
    : mensagens.length;
  const antes = mensagens.slice(0, ate === -1 ? mensagens.length : ate);
  const pessoa = [...antes].reverse().find((m) => m.role === 'user');
  const parte = pessoa?.content.find((p) => p.type === 'text');
  return parte?.text ?? '';
}

export function useMessageQueue({
  conversa,
  livre,
  enviar,
  falhou = false,
}: {
  /** Trocar de conversa descarta a fila: ela foi escrita para o assunto que ficou para trás. */
  conversa: string | null | undefined;
  livre: boolean;
  enviar: (texto: string) => void;
  /**
   * A última resposta falhou (403, 402, cota, rede): a fila **para**. O que foi escrito fica
   * esperando a pessoa decidir item a item ("Enviar"/"Descartar") — mandar sozinho só daria
   * no mesmo erro, ou numa resposta fora de ordem.
   */
  falhou?: boolean;
}) {
  // A fila guarda a conversa a que pertence; noutra conversa ela simplesmente
  // não existe. Derivar em vez de zerar num efeito evita um render com a fila
  // velha na conversa nova.
  const [fila, setFila] = useState<{ conversa: string | null; itens: ItemDaFila[] }>({
    conversa: null,
    itens: [],
  });
  const itens = useMemo(
    () => (fila.conversa === (conversa ?? null) ? fila.itens : SEM_ITENS),
    [fila, conversa],
  );

  // Uma por vez: a próxima só sai quando a resposta desta terminar. Entre o
  // envio e o começo da resposta a conversa ainda parece livre, e sem esta
  // trava a segunda sairia colada na primeira. Ela se solta quando a conversa
  // fica ocupada.
  const aguardandoResposta = useRef(false);
  useEffect(() => {
    if (!livre) aguardandoResposta.current = false;
  }, [livre]);

  useEffect(() => {
    if (!livre || falhou || aguardandoResposta.current || itens.length === 0) return;
    aguardandoResposta.current = true;
    const [proxima, ...resto] = itens;
    // O envio é o efeito colateral que esta fila existe para fazer, e tirar o
    // item na mesma passada é o que impede o mesmo texto de sair duas vezes.
    setFila({ conversa: conversa ?? null, itens: resto });
    enviar(proxima.texto);
  }, [livre, falhou, itens, conversa, enviar]);

  const enfileirar = useCallback(
    (texto: string) => {
      const limpo = texto.trim();
      if (!limpo) return;
      const dona = conversa ?? null;
      setFila((atual) => ({
        conversa: dona,
        itens: [
          ...(atual.conversa === dona ? atual.itens : []),
          { id: crypto.randomUUID(), texto: limpo },
        ],
      }));
    },
    [conversa],
  );

  const tirar = useCallback((id: string) => {
    setFila((atual) => ({ ...atual, itens: atual.itens.filter((item) => item.id !== id) }));
  }, []);

  /** Com a fila parada: manda este item agora, e só ele. */
  const mandar = useCallback(
    (id: string) => {
      const item = itens.find((i) => i.id === id);
      if (!item) return;
      setFila({ conversa: conversa ?? null, itens: itens.filter((i) => i.id !== id) });
      enviar(item.texto);
    },
    [itens, conversa, enviar],
  );

  return { itens, enfileirar, tirar, mandar, parada: falhou && itens.length > 0 };
}
