import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { CircuitCue } from '@fatia/api-client';
// O handler de primeiro plano é global e silencia o aviso do circuito com o app aberto.
import '@/notifications/foreground-handler';
import { Notifications } from '@/notifications/native';
import { colors } from '@/theme/colors';
import {
  CIRCUIT_CHANNEL_ID,
  CIRCUIT_NOTIFICATION_KIND,
  secondsUntil,
  type CircuitNotice,
} from './circuit-alarms';

/**
 * Som, vibração e avisos do relógio do circuito (#380), todos seguros no Expo
 * Go: `expo-haptics` e `expo-audio` vêm no Expo Go, e o `expo-notifications`
 * pode faltar (Android no Expo Go, `native.ts`), quando o circuito só apita com
 * a tela acesa. Qualquer falha de áudio cai no háptico, que é sempre tentado.
 *
 * Não coberto por teste automatizado (módulo nativo não monta no harness em
 * Node); o que é lógica está em `circuit-alarms.ts` e no api-client.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const SOURCES = {
  countdown: require('../../../../assets/sounds/circuit-tick.wav'),
  phase: require('../../../../assets/sounds/circuit-phase.wav'),
  done: require('../../../../assets/sounds/circuit-done.wav'),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

const players: Partial<Record<CircuitCue, AudioPlayer>> = {};

function player(cue: CircuitCue): AudioPlayer | null {
  try {
    players[cue] ??= createAudioPlayer(SOURCES[cue]);
    return players[cue] ?? null;
  } catch {
    return null;
  }
}

/** Carrega os sons antes do primeiro apito (o primeiro `play` não atrasa). */
export function preloadCircuitSounds() {
  player('countdown');
  player('phase');
  player('done');
}

export function releaseCircuitSounds() {
  for (const cue of Object.keys(players) as CircuitCue[]) {
    try {
      players[cue]?.remove();
    } catch {
      // Já liberado.
    }
    delete players[cue];
  }
}

export function playCircuitCue(cue: CircuitCue, { sound }: { sound: boolean }) {
  if (sound) {
    const p = player(cue);
    try {
      if (p) {
        void p.seekTo(0);
        p.play();
      }
    } catch {
      // Sem som: o háptico abaixo ainda avisa.
    }
  }
  try {
    if (cue === 'countdown') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (cue === 'phase') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Aparelho sem motor de vibração.
  }
}

async function ensurePermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CIRCUIT_CHANNEL_ID, {
        name: 'Relógio do circuito',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 120, 250],
        lightColor: colors.primary,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Agenda os avisos das próximas trocas e devolve os ids, para cancelar na volta. */
export async function scheduleCircuitNotices(notices: CircuitNotice[]): Promise<string[]> {
  if (!Notifications || notices.length === 0) return [];
  if (!(await ensurePermission())) return [];
  const ids: string[] = [];
  for (const n of notices) {
    // Os segundos saem agora, e não de quando a lista foi montada: o pedido de
    // permissão e os agendamentos anteriores levam tempo.
    const now = Date.now();
    if (n.at <= now) continue;
    try {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: {
            title: n.title,
            body: n.body,
            sound: 'default',
            data: { kind: CIRCUIT_NOTIFICATION_KIND },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntil(n.at, now),
            repeats: false,
            channelId: CIRCUIT_CHANNEL_ID,
          },
        }),
      );
    } catch {
      // Um aviso que não agendou não derruba os outros.
    }
  }
  return ids;
}

export async function cancelCircuitNotices(ids: string[]) {
  if (!Notifications) return;
  await Promise.all(
    ids.map((id) => Notifications!.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
}
