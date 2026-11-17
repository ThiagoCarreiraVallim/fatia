import type { CircuitCue } from '@fatia/api-client';

/**
 * O apito do circuito no navegador: um bipe do WebAudio (sem arquivo de som)
 * e a vibração onde o navegador tem (`navigator.vibrate`, Android). Sem
 * nenhum dos dois, a tela segue igual: a troca de fase também é cor e texto.
 *
 * O `AudioContext` nasce no primeiro toque da pessoa (o navegador não deixa
 * tocar som antes de um gesto) e é reaproveitado.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Chamado num toque (começar, pausar, ligar o som): libera o áudio do navegador. */
export function unlockCircuitSound() {
  audio();
}

function tone(frequency: number, durationMs: number, delayMs = 0) {
  const c = audio();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const start = c.currentTime + delayMs / 1000;
    const end = start + durationMs / 1000;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  } catch {
    // Sem som: a tela segue igual.
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Sem vibração.
  }
}

/** Contagem 3-2-1: bipe curto; troca de fase: bipe longo e agudo; fim: três bipes. */
export function playCircuitCue(cue: CircuitCue, { sound }: { sound: boolean }) {
  if (cue === 'countdown') {
    if (sound) tone(660, 120);
    vibrate(60);
  } else if (cue === 'phase') {
    if (sound) tone(990, 380);
    vibrate([180]);
  } else {
    if (sound) {
      tone(990, 220);
      tone(990, 220, 300);
      tone(1320, 500, 600);
    }
    vibrate([200, 100, 200, 100, 400]);
  }
}
