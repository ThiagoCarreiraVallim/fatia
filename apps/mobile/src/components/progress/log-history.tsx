import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pencil, Trash2 } from 'lucide-react-native';
import { DrawerScrollView, ErrorState, LoadingState, cn } from '@/components/ui';
import { chartColors } from '@/components/charts';
import { ToneBadge } from './progress-ui';
import { colors } from '@/theme/colors';

export interface LogHistoryEntry {
  id: string;
  /** Valor do registro, em destaque. */
  title: string;
  /** Data ou origem do registro. */
  subtitle: string;
  /** Hora do registro, depois da data ("19 mai · 08:12"). Fora do nome dos botões. */
  time?: string;
  /** Selo de origem (Al-G7): "manual" mudo, "Apple Saúde" verde. */
  badge?: { label: string; tone: 'ok' | 'mute' };
  /** Veio do celular: aparece, mas não se edita nem apaga daqui. */
  readOnly?: boolean;
}

/**
 * Lista de registros já salvos, com editar e apagar. Apagar não pergunta: quem
 * usa a lista mostra o aviso com "Desfazer" (registros pequenos, Fase 3).
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
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Recentes
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
        // O cartão é o próprio rolável: assim os cantos de baixo não somem na rolagem.
        <DrawerScrollView
          style={{
            maxHeight: 250,
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: colors.muted,
          }}
        >
          <View>
            {entries.map((entry, i) => {
              const editing = entry.id === editingId;
              const pending = entry.id === pendingId;
              return (
                <View
                  key={entry.id}
                  className={cn(
                    // O `.list` da prancha: um cartão, linhas separadas por um fio.
                    'flex-row items-center gap-2 px-4 py-2.5',
                    i > 0 && 'border-t border-border',
                    editing && 'rounded-card border-[1.5px] border-primary',
                    pending && 'opacity-50',
                  )}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-foreground">{entry.title}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {entry.subtitle}
                      {entry.time ? ` · ${entry.time}` : ''}
                    </Text>
                  </View>
                  {entry.badge?.tone === 'ok' ? (
                    <ToneBadge tone="ok" label={entry.badge.label} />
                  ) : entry.badge ? (
                    <Text className="px-1 font-sans-extrabold text-[11px] uppercase tracking-[0.4px] text-muted-foreground">
                      {entry.badge.label}
                    </Text>
                  ) : null}
                  {entry.readOnly ? null : (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Editar registro de ${entry.title}, ${entry.subtitle}`}
                        accessibilityState={{ selected: editing, disabled: pending }}
                        disabled={pending}
                        onPress={() => onEdit(entry)}
                        className="h-9 w-9 items-center justify-center rounded-full bg-card"
                      >
                        <Pencil
                          size={16}
                          color={editing ? chartColors.primary : chartColors.foreground}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Apagar registro de ${entry.title}, ${entry.subtitle}`}
                        accessibilityState={{ disabled: pending }}
                        disabled={pending}
                        onPress={() => onDelete(entry)}
                        className="h-9 w-9 items-center justify-center rounded-full bg-card"
                      >
                        {/* Apaga na hora, sem pergunta: o aviso com "Desfazer" (`useToast`)
                      é a rede de segurança. O vermelho do tema (#93000a) sumiria
                      sobre o card escuro. */}
                        <Trash2 size={16} color={chartColors.mutedForeground} />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </DrawerScrollView>
      ) : null}
    </View>
  );
}
