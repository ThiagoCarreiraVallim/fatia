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

const ConfirmContext = createContext<((request: ConfirmRequest) => void) | null>(null);

/**
 * `useConfirm()` substitui o `Alert.alert` de confirmação em qualquer tela.
 *
 * Existe porque montar um `ConfirmDrawer` por pergunta exige subir o estado
 * até o irmão do `<Screen>` — e nas telas da organização a pergunta nasce
 * dentro do `OrgPanel`, longe de lá. O provider mora no layout do app, numa
 * `DrawerLayer` própria, e qualquer componente só pede.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  return (
    <ConfirmContext.Provider value={setRequest}>
      {children}
      <DrawerLayer>
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
  const confirm = useContext(ConfirmContext);
  return useCallback(
    (request: ConfirmRequest) => {
      if (confirm) confirm(request);
      else if (__DEV__) console.warn('useConfirm fora de <ConfirmProvider>: nada foi perguntado.');
    },
    [confirm],
  );
}
