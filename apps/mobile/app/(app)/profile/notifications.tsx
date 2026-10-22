import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import {
  NOTIFICATION_KIND_INFO,
  NOTIFICATION_KINDS,
  notificationsApi,
  type NotificationKind,
  type NotificationPreferences,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, cn, ErrorState, LoadingState } from '@/components/ui';
import { disablePush, enablePush, pushDeviceId, type PushSetup } from '@/notifications/push';
import { cores } from '@/theme/cores';

const PREFS_KEY = ['users', 'me', 'notifications'] as const;

const AVISO_SETUP: Record<Exclude<PushSetup, 'enabled'>, string> = {
  denied: 'O celular não deixou o Fatia mandar avisos. Libere nas configurações do sistema.',
  unavailable: 'Esta versão do app não recebe avisos. Atualize pela loja quando puder.',
};

function Chave({
  label,
  hint,
  ligado,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  ligado: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: ligado, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onToggle}
      className={cn(
        'min-h-[44px] flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80',
        disabled && 'opacity-50',
      )}
    >
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center rounded border',
          ligado ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}
      >
        {ligado ? <Check size={14} color={cores.primaryForeground} /> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{hint}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Perfil → Notificações (Fase 8c): ligar os avisos neste celular e escolher o
 * que chega. As chaves valem para todos os celulares da conta; a web mostra
 * as mesmas.
 */
export default function NotificationsScreen() {
  const qc = useQueryClient();
  const [aqui, setAqui] = useState<boolean | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void pushDeviceId().then((id) => setAqui(id !== null));
  }, []);

  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: () => notificationsApi.preferences() });
  const salvar = useMutation({
    mutationFn: (input: Partial<NotificationPreferences>) => notificationsApi.setPreferences(input),
    onSuccess: (r) => qc.setQueryData(PREFS_KEY, r),
  });

  const alternarAqui = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      if (aqui) {
        await disablePush();
        setAqui(false);
      } else {
        const r = await enablePush(true);
        setAqui(r === 'enabled');
        if (r !== 'enabled') setAviso(AVISO_SETUP[r]);
      }
    } catch {
      setAviso('Não deu para mudar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Screen>
      <View className="gap-5 p-4">
        <View className="gap-2">
          <Chave
            label="Avisos neste celular"
            hint="Convites, desafios e o mural das suas comunidades. Nunca dado de saúde."
            ligado={aqui === true}
            disabled={aqui === null || ocupado}
            onToggle={() => void alternarAqui()}
          />
          {aviso ? (
            <View className="gap-2">
              <Text accessibilityRole="alert" className="text-xs text-muted-foreground">
                {aviso}
              </Text>
              {aviso === AVISO_SETUP.denied ? (
                <Button variant="outline" size="sm" onPress={() => void Linking.openSettings()}>
                  <Text className="text-sm font-semibold text-foreground">Abrir configurações</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="gap-2">
          <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
            O que chega
          </Text>
          {prefs.isPending ? <LoadingState /> : null}
          {prefs.isError ? (
            <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
          ) : null}
          {prefs.data
            ? NOTIFICATION_KINDS.map((k: NotificationKind) => (
                <Chave
                  key={k}
                  label={NOTIFICATION_KIND_INFO[k].label}
                  hint={NOTIFICATION_KIND_INFO[k].hint}
                  ligado={prefs.data[k]}
                  disabled={salvar.isPending}
                  onToggle={() => salvar.mutate({ [k]: !prefs.data[k] })}
                />
              ))
            : null}
          {salvar.isError ? (
            <Text accessibilityRole="alert" className="text-xs text-destructive">
              Não deu para salvar agora. Tente de novo.
            </Text>
          ) : null}
          <Text className="text-xs text-muted-foreground">
            Valem para todos os celulares em que você ligou os avisos.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
