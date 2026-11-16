import { useState } from 'react';
import { Drawer, DrawerContent, Segmented } from '@/components/ui';
import { LogStepsDrawer } from './log-steps-drawer';
import { LogWeightDrawer } from './log-weight-drawer';

export type BodyLogKind = 'weight' | 'steps';

const KINDS: { value: BodyLogKind; label: string }[] = [
  { value: 'weight', label: 'Peso' },
  { value: 'steps', label: 'Passos' },
];

/**
 * Registrar peso (prancha Al-G7, #382) — réplica de
 * `apps/web/src/components/progress/body-log-sheet.tsx`. Uma folha para peso e passos,
 * com o segmentado no topo; trocar o segmento troca o miolo sem fechar a folha.
 */
export function BodyLogSheet({
  open,
  onClose,
  initialKind = 'weight',
  date,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: BodyLogKind;
  date?: string;
}) {
  const [kind, setKind] = useState<BodyLogKind>(initialKind);
  // Cada abertura começa limpa e no tipo pedido: o miolo remonta pela chave.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(initialKind);
      setSession((n) => n + 1);
    }
  }

  const switcher = (
    <Segmented
      label="O que registrar"
      options={KINDS}
      value={kind}
      onChange={setKind}
      className="mt-2"
    />
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="px-4">
        {kind === 'weight' ? (
          <LogWeightDrawer
            key={`w${session}`}
            embedded
            open={open}
            onClose={onClose}
            date={date}
            switcher={switcher}
          />
        ) : (
          <LogStepsDrawer
            key={`s${session}`}
            embedded
            open={open}
            onClose={onClose}
            date={date}
            switcher={switcher}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
