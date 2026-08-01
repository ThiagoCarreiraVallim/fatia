import { Pressable, Text, View } from 'react-native';
import { ExternalLink, Trash2 } from 'lucide-react-native';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { ExportDataButton } from './export-data-button';
import { openLegal, type LegalPath } from './legal';

/**
 * Direitos da LGPD exercidos de dentro do app: portabilidade e eliminação.
 *
 * O PWA só cita os endpoints na página de privacidade — não tem interface para
 * nenhum dos dois. Aqui existe porque as lojas exigem a exclusão de conta pelo
 * app, e porque exportar sem interface, no celular, é o mesmo que não existir.
 */
export function PrivacyCard({ onDeleteAccount }: { onDeleteAccount: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seus dados</CardTitle>
        <CardDescription>
          Leve uma cópia de tudo o que você registrou, ou apague a conta e os dados de vez.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <ExportDataButton />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apagar minha conta"
          accessibilityHint="Remove a conta e todos os dados. Pede confirmação."
          onPress={onDeleteAccount}
          className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-md border border-destructive px-4 py-2 active:opacity-80"
        >
          <Trash2 size={16} color="#93000a" />
          <Text className="text-sm font-medium text-destructive">Apagar minha conta</Text>
        </Pressable>

        <View className="flex-row flex-wrap gap-x-4">
          <LegalLink path="/privacy" label="Política de Privacidade" />
          <LegalLink path="/terms" label="Termos de uso" />
        </View>
      </CardContent>
    </Card>
  );
}

function LegalLink({ path, label }: { path: LegalPath; label: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Abre no navegador"
      onPress={() => openLegal(path)}
      className="min-h-[44px] flex-row items-center gap-1.5"
    >
      <Text className="text-sm text-muted-foreground underline">{label}</Text>
      <ExternalLink size={12} color="#baccaf" />
    </Pressable>
  );
}
