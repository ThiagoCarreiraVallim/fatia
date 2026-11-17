import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { inAppPurchaseAvailable } from '@/billing/purchases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

const FEATURES = [
  {
    icon: 'chat',
    label: 'Conversa',
    title: 'Fale com a IA',
    text: 'Pergunte quanto falta de proteína ou peça uma troca.',
  },
  {
    icon: 'camera',
    label: 'Foto do prato',
    title: 'Fotografe o prato',
    text: 'A IA monta a refeição e você só confere.',
  },
  { icon: 'mic', label: 'Voz', title: 'Diga o que comeu', text: 'Fala e pronto, sem digitar.' },
] as const;

/**
 * O chat da IA para quem está no Free (prancha Al-M1, #386). Componente
 * fechado: a tela do chat só troca o conteúdo por este quando a pessoa não
 * tem direito à IA.
 *
 * Com compra no app, "Ver o PRO" leva ao Meu plano (a oferta é da loja). Sem
 * ela, nada de preço ou link: "O PRO vem pela sua comunidade" e "Tenho código".
 * "Usar minha IA pelo MCP" é sempre grátis.
 */
export function ChatLocked({ available }: { available: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState(1);
  const iap = inAppPurchaseAvailable();
  const f = FEATURES[picked]!;

  if (!available) {
    return (
      <View className="gap-2 rounded-card bg-card p-5">
        <Text className="font-sans-semibold text-base text-foreground">
          O assistente não está disponível neste app
        </Text>
        <Text className="text-sm text-muted-foreground">
          O registro manual e a sua própria IA pelo MCP continuam livres.
        </Text>
        <Button variant="outline" onPress={() => router.push('/profile/tokens')}>
          Usar minha IA pelo MCP
        </Button>
      </View>
    );
  }

  return (
    <>
      <View className="gap-5 rounded-card bg-card p-5">
        <View className="flex-row justify-center gap-3">
          {FEATURES.map((x, i) => (
            <Pressable
              key={x.icon}
              accessibilityRole="button"
              accessibilityLabel={x.label}
              accessibilityState={{ selected: i === picked }}
              onPress={() => setPicked(i)}
              className={cn(
                'h-14 w-14 items-center justify-center rounded-field',
                i === picked ? 'bg-primary' : 'bg-muted',
              )}
            >
              <Icon
                name={x.icon}
                size={24}
                color={i === picked ? colors.primaryForeground : colors.foreground}
              />
            </Pressable>
          ))}
        </View>
        <View className="gap-1">
          <Text
            accessibilityRole="header"
            className="text-center font-display text-xl text-foreground"
          >
            {f.title}
          </Text>
          <Text className="text-center text-sm text-muted-foreground">{f.text}</Text>
        </View>
        <View className="flex-row items-center justify-center gap-2">
          <Badge variant="free">Free</Badge>
          <Text className="text-xs text-muted-foreground">Registro manual segue grátis</Text>
        </View>

        {iap ? (
          <Button size="xl" onPress={() => router.push('/plan?recurso=chat')}>
            Ver o PRO
          </Button>
        ) : (
          <>
            <Text className="text-center text-sm text-foreground">
              O PRO vem pela sua comunidade. Peça o código à equipe.
            </Text>
            {/* A folha do código mora na Comunidade: este cartão vive dentro da rolagem do chat. */}
            <Button size="xl" onPress={() => router.push('/community?join=1')}>
              Tenho código
            </Button>
          </>
        )}
        <Button variant="outline" onPress={() => router.push('/profile/tokens')}>
          Usar minha IA pelo MCP
        </Button>
        <Button variant="text" onPress={() => router.replace('/')}>
          Agora não
        </Button>
      </View>
    </>
  );
}
