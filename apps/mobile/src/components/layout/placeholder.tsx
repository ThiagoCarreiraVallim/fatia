import { Text, View } from 'react-native';
import { Screen } from './screen';

/**
 * Rota que existe na navegação mas ainda não foi portada.
 *
 * Fica visível de propósito, com o nome da tela do PWA que ela replica: uma tela
 * em branco não distingue "ainda não feito" de "quebrou". A auditoria de
 * paridade (#130) falha se qualquer uma sobrar.
 */
export function Placeholder({ route, back }: { route: string; back?: boolean }) {
  return (
    <Screen back={back} title={route}>
      <View className="items-center gap-2 px-6 py-16">
        <Text className="text-center text-base font-medium text-foreground">Em construção</Text>
        <Text className="text-center text-sm text-muted-foreground">
          Réplica de {route} no PWA.
        </Text>
      </View>
    </Screen>
  );
}
