import { Alert, Pressable, Text, View } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { DrawerScrollView, ErrorState, LoadingState, cn } from '@/components/ui';
import { chartColors } from '@/components/charts';

export interface LogHistoryEntry {
  id: string;
  /** Valor do registro, em destaque. */
  title: string;
  /** Data ou origem do registro. */
  subtitle: string;
}

/**
 * Lista de registros já salvos, com editar e apagar.
 *
 * É o ganho da issue #116: no PWA peso, passos e água só podem ser criados —
 * corrigir um número errado depende de pedir ao Claude. A API sempre suportou
 * `PATCH` e `DELETE`; faltava interface, e no aparelho é onde o erro de digitação
 * acontece.
 */
export function LogHistory({
  entries,
  isLoading,
  error,
  onRetry,
  editingId,
  onEdit,
  onDelete,
  pendingId,
  emptyLabel,
  confirmTitle,
}: {
  entries: LogHistoryEntry[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  editingId: string | null;
  onEdit: (entry: LogHistoryEntry) => void;
  onDelete: (entry: LogHistoryEntry) => void;
  pendingId: string | null;
  emptyLabel: string;
  confirmTitle: string;
}) {
  function confirmDelete(entry: LogHistoryEntry) {
    Alert.alert(confirmTitle, `${entry.title} — ${entry.subtitle}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => onDelete(entry) },
    ]);
  }

  return (
    <View className="gap-2">
      <Text className="text-[11px] font-bold tracking-wide text-muted-foreground">
        REGISTROS RECENTES
      </Text>

      {isLoading ? <LoadingState label="" /> : null}

      {error ? <ErrorState error={error} onRetry={onRetry} /> : null}

      {!isLoading && !error && entries.length === 0 ? (
        <Text className="py-4 text-center text-xs text-muted-foreground">{emptyLabel}</Text>
      ) : null}

      {entries.length > 0 ? (
        // `DrawerScrollView` (e não `ScrollView`) para a rolagem não disputar o
        // gesto de arrastar o sheet. A altura precisa ser limitada, senão a lista
        // empurra o formulário para fora da tela.
        <DrawerScrollView style={{ maxHeight: 190 }}>
          {entries.map((entry) => {
            const editing = entry.id === editingId;
            const pending = entry.id === pendingId;
            return (
              <View
                key={entry.id}
                className={cn(
                  'mb-1.5 flex-row items-center gap-2 rounded-xl bg-card px-3 py-2',
                  editing && 'border border-primary',
                  pending && 'opacity-50',
                )}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-bold text-foreground">{entry.title}</Text>
                  <Text className="text-xs text-muted-foreground">{entry.subtitle}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar registro de ${entry.subtitle}`}
                  accessibilityState={{ selected: editing, disabled: pending }}
                  disabled={pending}
                  onPress={() => onEdit(entry)}
                  className="h-11 w-11 items-center justify-center rounded-xl"
                >
                  <Pencil
                    size={16}
                    color={editing ? chartColors.primary : chartColors.foreground}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apagar registro de ${entry.subtitle}`}
                  accessibilityState={{ disabled: pending }}
                  disabled={pending}
                  onPress={() => confirmDelete(entry)}
                  className="h-11 w-11 items-center justify-center rounded-xl"
                >
                  {/* O vermelho do tema (#93000a) é escuro demais sobre o card
                      escuro — o ícone sumiria. O aviso de perigo fica no diálogo
                      de confirmação, que o sistema já pinta de vermelho. */}
                  <Trash2 size={16} color={chartColors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}
        </DrawerScrollView>
      ) : null}
    </View>
  );
}
