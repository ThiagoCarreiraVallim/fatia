import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { experienceErrorMessage, passwordIssueMessage, passwordIssues } from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { AUTH_INPUT, ErrorText } from '@/components/auth/account-form';
import { CodeField, PasswordField } from '@/components/auth/auth-fields';
import { Button, Text } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * "Esqueci minha senha" e "Trocar senha" (Você), dentro do app (ADR 050): o
 * código vai ao e-mail pela Experience API do Logto, e a senha nova é digitada
 * aqui. Sem sessão, entra na conta com a senha nova ao terminar.
 */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const signedIn = auth.status === 'signedIn';

  const issues = passwordIssues(auth.passwordPolicy, password, { email });
  const issueText =
    password.length > 0 && issues[0] ? passwordIssueMessage(issues[0], auth.passwordPolicy) : null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(experienceErrorMessage(err, auth.passwordPolicy));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    void run(async () => {
      await auth.startPasswordReset(email);
      setCode('');
      setStep('code');
    });

  const save = () => {
    if (issues[0]) {
      setMessage(passwordIssueMessage(issues[0], auth.passwordPolicy));
      return;
    }
    void run(async () => {
      await auth.finishPasswordReset({ code, password });
      if (signedIn) setStep('done');
      else router.replace('/');
    });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: 14,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Button variant="link" className="self-start px-0" onPress={goBack}>
        Voltar
      </Button>
      <Text accessibilityRole="header" className="font-display text-[28px] text-foreground">
        {signedIn ? 'Trocar senha' : 'Esqueci minha senha'}
      </Text>

      {step === 'email' ? (
        <>
          <Text className="text-sm text-muted-foreground">
            Mandamos um código para o seu e-mail. Com ele você escolhe uma senha nova.
          </Text>
          <TextInput
            accessibilityLabel="E-mail"
            placeholder="E-mail"
            placeholderTextColor={colors.placeholder}
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!signedIn || !params.email}
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
            className={AUTH_INPUT}
          />
          <Button size="xl" loading={busy} disabled={!email.trim()} onPress={sendCode}>
            Enviar código
          </Button>
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <Text className="text-sm text-muted-foreground">
            Digite o código que chegou em {email.trim().toLowerCase()} e a senha nova.
          </Text>
          <CodeField value={code} onChange={setCode} />
          <PasswordField
            label="Senha nova"
            value={password}
            onChange={setPassword}
            isNew
            onSubmit={save}
          />
          {issueText ? <Text className="text-xs text-muted-foreground">{issueText}</Text> : null}
          <Button size="xl" loading={busy} disabled={code.length < 6 || !password} onPress={save}>
            Salvar senha nova
          </Button>
          <Button variant="link" disabled={busy} onPress={sendCode}>
            Reenviar código
          </Button>
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <Text className="text-sm text-muted-foreground">
            Pronto, sua senha foi trocada. Use a nova no próximo login.
          </Text>
          <Button size="xl" onPress={goBack}>
            Voltar
          </Button>
        </>
      ) : null}

      <ErrorText message={message} />
    </ScrollView>
  );
}
