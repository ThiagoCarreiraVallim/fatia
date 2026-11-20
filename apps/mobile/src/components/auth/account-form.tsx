import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  cleanName,
  experienceErrorMessage,
  passwordIssueMessage,
  passwordIssues,
  type SocialTarget,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { Button, Segmented, Text } from '@/components/ui';
import { colors } from '@/theme/colors';
import { AppleIcon, GoogleIcon } from './social-icons';
import { CodeField, PasswordField } from './auth-fields';

const APPLE_BUTTON = { background: '#e5e2e1', text: '#111111' } as const;

export const AUTH_INPUT = 'h-[52px] rounded-field bg-card px-[18px] text-base text-foreground';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * A etapa 1 do onboarding (Onb-01a e Onb-01b): criar conta (nome, e-mail e
 * senha, com o código que chega no e-mail) e entrar (e-mail e senha), tudo
 * nesta tela, pela Experience API do Logto (ADR 050). Google e Apple abrem o
 * navegador só para o consentimento do provedor, e só aparecem quando o Logto
 * tem o conector configurado.
 */
export function AccountForm({
  showModeSwitch = true,
  brandCta = false,
}: {
  showModeSwitch?: boolean;
  /** O botão principal na cor da comunidade (Onb-01a). */
  brandCta?: boolean;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const create = mode === 'create';

  const issues = passwordIssues(auth.passwordPolicy, password, { name, email });
  const issueText =
    create && password.length > 0 && issues[0]
      ? passwordIssueMessage(issues[0], auth.passwordPolicy)
      : null;

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

  const validate = (): string | null => {
    if (create && !cleanName(name)) return 'Diga seu nome.';
    if (!EMAIL.test(email.trim())) return 'Confira o e-mail.';
    if (!password) return 'Digite a senha.';
    if (create && issues[0]) return passwordIssueMessage(issues[0], auth.passwordPolicy);
    return null;
  };

  const submit = () => {
    setTouched(true);
    const invalid = validate();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    void run(async () => {
      if (create) {
        await auth.startSignup(email);
        setCode('');
        setStep('code');
      } else {
        await auth.signInWithPassword(email, password);
      }
    });
  };

  const confirmCode = () =>
    void run(() => auth.finishSignup({ code, password, name: cleanName(name) }));

  if (step === 'code') {
    return (
      <View className="gap-3.5">
        <Text className="font-display text-xl text-foreground">Confira seu e-mail</Text>
        <Text className="text-sm text-muted-foreground">
          Mandamos um código de 6 dígitos para {email.trim().toLowerCase()}. Digite aqui para criar
          a conta.
        </Text>
        <CodeField value={code} onChange={setCode} onSubmit={confirmCode} />
        <Button
          size="xl"
          variant={brandCta ? 'brand' : 'default'}
          loading={busy}
          disabled={code.trim().length < 6}
          onPress={confirmCode}
        >
          Criar conta
        </Button>
        <View className="flex-row justify-between">
          <Button
            variant="link"
            disabled={busy}
            onPress={() => {
              setStep('form');
              setMessage(null);
            }}
          >
            Voltar
          </Button>
          <Button
            variant="link"
            disabled={busy}
            onPress={() => void run(() => auth.startSignup(email))}
          >
            Reenviar código
          </Button>
        </View>
        <ErrorText message={message} />
      </View>
    );
  }

  return (
    <View className="gap-3.5">
      {showModeSwitch ? (
        <Segmented
          label="Conta"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMessage(null);
          }}
          options={[
            { value: 'create', label: 'Criar conta' },
            { value: 'login', label: 'Entrar' },
          ]}
        />
      ) : null}
      {create ? (
        <TextInput
          accessibilityLabel="Seu nome"
          placeholder="Seu nome"
          placeholderTextColor={colors.placeholder}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          value={name}
          onChangeText={setName}
          className={AUTH_INPUT}
        />
      ) : null}
      <TextInput
        accessibilityLabel="E-mail"
        placeholder="E-mail"
        placeholderTextColor={colors.placeholder}
        autoComplete="email"
        textContentType={create ? 'emailAddress' : 'username'}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        className={AUTH_INPUT}
      />
      <PasswordField value={password} onChange={setPassword} isNew={create} onSubmit={submit} />
      {issueText && (touched || password.length >= auth.passwordPolicy.length.min) ? (
        <Text className="text-xs text-muted-foreground">{issueText}</Text>
      ) : null}
      <Button
        size="xl"
        variant={brandCta ? 'brand' : 'default'}
        loading={busy || auth.status === 'loading'}
        onPress={submit}
      >
        {create ? 'Criar conta' : 'Entrar'}
      </Button>
      {!create ? (
        <Button
          variant="link"
          disabled={busy}
          onPress={() =>
            router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
          }
        >
          Esqueci minha senha
        </Button>
      ) : null}
      <SocialButtons targets={auth.socialTargets} disabled={busy} onPress={auth.signInWithSocial} />
      <ErrorText message={message ?? auth.error} />
    </View>
  );
}

function SocialButtons({
  targets,
  disabled,
  onPress,
}: {
  targets: SocialTarget[];
  disabled: boolean;
  onPress: (target: SocialTarget) => Promise<void>;
}) {
  // Sem conector no Logto, o botão some: nunca cai na tela de senha do Logto.
  if (targets.length === 0) return null;
  return (
    <>
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text className="text-xs text-faint">ou</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <View className="flex-row gap-3">
        {targets.includes('google') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuar com Google"
            disabled={disabled}
            onPress={() => void onPress('google')}
            className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-card"
          >
            <GoogleIcon />
            <Text className="text-sm font-bold text-foreground">Google</Text>
          </Pressable>
        ) : null}
        {targets.includes('apple') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuar com Apple"
            disabled={disabled}
            onPress={() => void onPress('apple')}
            // O botão claro da prancha, igual nos dois temas (as cores da Apple).
            style={{ backgroundColor: APPLE_BUTTON.background }}
            className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg"
          >
            <AppleIcon color={APPLE_BUTTON.text} />
            <Text className="text-sm font-bold" style={{ color: APPLE_BUTTON.text }}>
              Apple
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="text-center text-xs text-danger">
      {message}
    </Text>
  );
}
