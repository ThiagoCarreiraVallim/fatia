import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, usersApi } from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { ErrorText } from '@/components/auth/account-form';
import { CodeField, PasswordField } from '@/components/auth/auth-fields';
import { Screen } from '@/components/layout/screen';
import { Button, Input } from '@/components/ui';
import { Text } from '@/components/ui/text';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return 'Senha ou código incorreto.';
    if (err.status === 409) return 'Não foi possível usar este e-mail.';
    if (err.status === 429) return 'Muitas tentativas. Espere um minuto.';
    if (err.status === 503) return 'A troca de e-mail não está disponível agora.';
  }
  return 'Não foi possível trocar o e-mail agora. Tente de novo.';
}

/**
 * Trocar e-mail (ADR 050): a senha atual e um código no e-mail novo. Só aparece
 * quando a API tem a Management API do Logto (`emailChangeEnabled`).
 */
export default function ChangeEmailScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const auth = useAuth();
  const [requestToken, setRequestToken] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    void run(async () => {
      const pending = await usersApi.requestEmailChange({ email: email.trim(), password });
      setRequestToken(pending.requestToken);
      setStep('code');
    });

  const confirm = () =>
    void run(async () => {
      await usersApi.confirmEmailChange({ email: email.trim(), code, requestToken });
      // O ID token guardado traz o e-mail velho: renova agora (ADR 050).
      await auth.refreshSession().catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ['users', 'me'] });
      router.back();
    });

  return (
    <Screen>
      <View className="gap-4 px-6 pb-8 pt-2">
        <Text accessibilityRole="header" className="font-display text-[28px] text-foreground">
          Trocar e-mail
        </Text>
        {step === 'form' ? (
          <>
            <Text className="text-[15px] text-muted-foreground">
              Confirme sua senha. Mandamos um código para o e-mail novo.
            </Text>
            <Input
              accessibilityLabel="E-mail novo"
              placeholder="E-mail novo"
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              className="h-[52px] rounded-field bg-card px-[18px] text-base"
            />
            <PasswordField
              label="Senha atual"
              value={password}
              onChange={setPassword}
              isNew={false}
              onSubmit={sendCode}
            />
            <Button
              size="xl"
              loading={busy}
              disabled={!EMAIL.test(email.trim()) || !password}
              onPress={sendCode}
            >
              Enviar código
            </Button>
          </>
        ) : (
          <>
            <Text className="text-[15px] text-muted-foreground">
              Se {email.trim().toLowerCase()} puder ser usado, o código chega em instantes. Digite
              aqui.
            </Text>
            <CodeField value={code} onChange={setCode} onSubmit={confirm} />
            <Button size="xl" loading={busy} disabled={code.length < 6} onPress={confirm}>
              Trocar e-mail
            </Button>
            <Button variant="link" disabled={busy} onPress={sendCode}>
              Reenviar código
            </Button>
          </>
        )}
        <ErrorText message={message} />
      </View>
    </Screen>
  );
}
