'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@fatia/api-client';

/**
 * O ditado do composer (#141): grava, transcreve e devolve o texto.
 *
 * O texto vai para o campo, e **não** é enviado: transcrição erra nome de
 * alimento e número ("duzentos" vira "dez"), e mandar sem a pessoa ler faria o
 * erro virar registro. O áudio vive na memória desta aba até a transcrição
 * voltar (ADR 020).
 */

export type EstadoDoDitado = 'parado' | 'gravando' | 'transcrevendo';

/**
 * O primeiro formato que o navegador grava. O Safari não grava webm, e um Blob
 * rotulado com o tipo errado faz o servidor escolher o decodificador errado.
 */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'] as const;

export function formatoDeGravacao(
  suporta: (tipo: string) => boolean = (tipo) => MediaRecorder.isTypeSupported(tipo),
): string | undefined {
  return FORMATOS.find((tipo) => suporta(tipo));
}

export function useDitado(onTexto: (texto: string) => void, onErro: (mensagem: string) => void) {
  const [estado, setEstado] = useState<EstadoDoDitado>('parado');
  const gravador = useRef<MediaRecorder | null>(null);
  const descartar = useRef(false);
  const callbacks = useRef({ onTexto, onErro });
  useEffect(() => {
    callbacks.current = { onTexto, onErro };
  }, [onTexto, onErro]);

  useEffect(
    () => () => {
      descartar.current = true;
      gravador.current?.stop();
    },
    [],
  );

  const comecar = useCallback(async () => {
    if (gravador.current) return;
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      callbacks.current.onErro('Sem acesso ao microfone. Libere nas permissões do navegador.');
      return;
    }
    const tipo = formatoDeGravacao();
    const recorder = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
    const pedacos: Blob[] = [];
    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) pedacos.push(evento.data);
    };
    recorder.onstop = async () => {
      for (const trilha of fluxo.getTracks()) trilha.stop();
      gravador.current = null;
      if (descartar.current || pedacos.length === 0) {
        descartar.current = false;
        setEstado('parado');
        return;
      }
      setEstado('transcrevendo');
      try {
        const audio = new Blob(pedacos, { type: recorder.mimeType || tipo || 'audio/webm' });
        const { text } = await transcribeAudio(audio);
        if (text.trim()) callbacks.current.onTexto(text.trim());
        else callbacks.current.onErro('Não deu para entender o áudio. Tente de novo.');
      } catch {
        callbacks.current.onErro('A transcrição falhou. Tente de novo ou escreva.');
      } finally {
        setEstado('parado');
      }
    };
    gravador.current = recorder;
    recorder.start();
    setEstado('gravando');
  }, []);

  const parar = useCallback(() => gravador.current?.stop(), []);

  const cancelar = useCallback(() => {
    descartar.current = true;
    gravador.current?.stop();
  }, []);

  return { estado, comecar, parar, cancelar };
}
