import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from './button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
} from './drawer';
import { FormMessage } from './form';

/**
 * Pergunta de sim ou não no visual do app, no lugar do `Alert` do sistema.
 *
 * O `Alert` nativo é cinza-claro no Android, com botões em caixa alta e
 * fonte do sistema: no meio de um app escuro ele parece outro programa
 * interrompendo. O resto do app pergunta em drawer (finalizar treino, excluir
 * conta), então as perguntas curtas também.
 *
 * Como todo drawer, é irmão do `<Screen>` dentro de `<DrawerLayer>` (ver
 * `drawer.tsx`).
 */
export function ConfirmDrawer({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Voltar',
  destructive,
  loading,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação que apaga algo: botão vermelho. */
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  /** Conteúdo extra entre a descrição e os botões. */
  children?: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>

        {children ? <View className="py-2">{children}</View> : null}
        {error ? <FormMessage>{error}</FormMessage> : null}

        <DrawerFooter className="px-0 pt-4">
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={loading}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface ActionSheetOption {
  label: string;
  /** Apaga ou tira algo: texto vermelho. */
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetRequest {
  title: string;
  description?: string;
  options: ActionSheetOption[];
}

const ConfirmContext = createContext<{
  confirm: (request: ConfirmRequest) => void;
  actionSheet: (request: ActionSheetRequest) => void;
} | null>(null);

/**
 * `useConfirm()` substitui o `Alert.alert` de confirmação em qualquer tela.
 *
 * Existe porque montar um `ConfirmDrawer` por pergunta exige subir o estado
 * até o irmão do `<Screen>` — e nas telas da organização a pergunta nasce
 * dentro do `OrgPanel`, longe de lá. O provider mora no layout do app, numa
 * `DrawerLayer` própria, e qualquer componente só pede.
 *
 * O mesmo provider serve o `useActionSheet()`, que substitui o `Alert` usado
 * como menu ("Renomear / Apagar / Cancelar"). Escolher uma opção fecha o menu
 * antes de rodar a ação, então a ação pode abrir uma confirmação em seguida.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [sheet, setSheet] = useState<ActionSheetRequest | null>(null);
  const [value] = useState(() => ({ confirm: setRequest, actionSheet: setSheet }));

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <DrawerLayer>
        <Drawer
          open={sheet != null}
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
        >
          <DrawerContent className="px-4">
            <DrawerHeader className="px-0">
              <DrawerTitle>{sheet?.title ?? ''}</DrawerTitle>
              {sheet?.description ? (
                <DrawerDescription>{sheet.description}</DrawerDescription>
              ) : null}
            </DrawerHeader>
            <View className="gap-2 pt-2">
              {sheet?.options.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  className="justify-start rounded-xl"
                  textClassName={option.destructive ? 'text-danger' : undefined}
                  onPress={() => {
                    setSheet(null);
                    option.onPress();
                  }}
                >
                  {option.label}
                </Button>
              ))}
              <Button variant="ghost" onPress={() => setSheet(null)}>
                Cancelar
              </Button>
            </View>
          </DrawerContent>
        </Drawer>
        <ConfirmDrawer
          open={request != null}
          onOpenChange={(open) => {
            if (!open) setRequest(null);
          }}
          title={request?.title ?? ''}
          description={request?.description}
          confirmLabel={request?.confirmLabel ?? ''}
          cancelLabel={request?.cancelLabel}
          destructive={request?.destructive}
          onConfirm={() => {
            setRequest(null);
            request?.onConfirm();
          }}
        />
      </DrawerLayer>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (request: ConfirmRequest) => void {
  const context = useContext(ConfirmContext);
  return useCallback(
    (request: ConfirmRequest) => {
      if (context) context.confirm(request);
      else if (__DEV__) console.warn('useConfirm fora de <ConfirmProvider>: nada foi perguntado.');
    },
    [context],
  );
}

export function useActionSheet(): (request: ActionSheetRequest) => void {
  const context = useContext(ConfirmContext);
  return useCallback(
    (request: ActionSheetRequest) => {
      if (context) context.actionSheet(request);
      else if (__DEV__) console.warn('useActionSheet fora de <ConfirmProvider>.');
    },
    [context],
  );
}
