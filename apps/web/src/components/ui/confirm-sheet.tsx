'use client';

import type { IconName } from '@fatia/design';
import { Button } from './button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from './drawer';
import { Icon } from './icon';

/**
 * Confirmação curta em folha (prancha Componentes · Folhas · Confirmar): um
 * ícone, uma linha, duas ações. Substitui o `ConfirmDialog` nas telas
 * redesenhadas; o diálogo antigo continua até cada tela trocar.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  icon = 'trash',
  confirmLabel = 'Apagar',
  pendingLabel = 'Apagando...',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Uma linha: o que se perde. */
  description: string;
  icon?: IconName;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="items-center text-center">
          <span
            className={
              tone === 'danger'
                ? 'mb-2 flex h-12 w-12 items-center justify-center rounded-field bg-[hsl(var(--danger)/0.14)] text-danger'
                : 'mb-2 flex h-12 w-12 items-center justify-center rounded-field bg-muted text-foreground'
            }
          >
            <Icon name={icon} size={24} />
          </span>
          <DrawerTitle className="font-display text-xl font-bold">{title}</DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="gap-2">
          <Button
            variant={tone === 'danger' ? 'danger' : 'default'}
            size="xl"
            full
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <Button variant="text" size="xl" full onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
