'use client';

import { useState } from 'react';
import {
  SHARE_TARGETS,
  shareIdentityOptions,
  type ShareIdentityOption,
  type ShareTarget,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/selection';
import { ShareCard, type ShareCardData, type ShareIdentity } from './share-card';

function toIdentity(o: ShareIdentityOption): ShareIdentity {
  return o.as === 'none' ? { as: 'none' } : { as: o.as, value: o.value };
}

/**
 * Folha "Compartilhar" (prancha Componentes-plano · 1.5): a prévia do cartão,
 * "Aparecer como" (nome de exibição, @ ou ninguém) e os destinos. O cartão
 * nunca leva peso, medida ou corpo — `ShareCard` não tem prop para isso.
 */
export function ShareSheet({
  open,
  onOpenChange,
  data,
  person,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShareCardData;
  person: { name: string; handle: string | null };
  onShare: (target: ShareTarget, identity: ShareIdentity) => void;
}) {
  const options = shareIdentityOptions(person);
  const [as, setAs] = useState<ShareIdentityOption['as']>(options[0]!.as);
  const chosen = options.find((o) => o.as === as) ?? options[0]!;
  const identity = toIdentity(chosen);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Compartilhar</DrawerTitle>
          <DrawerDescription className="sr-only">
            Escolha como aparecer no cartão e para onde mandar.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <ShareCard data={data} identity={identity} className="mx-auto max-w-[220px]" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground">Aparecer como</span>
            <Segmented
              label="Aparecer como"
              value={as}
              onChange={setAs}
              options={options.map((o) => ({ value: o.as, label: o.label }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SHARE_TARGETS.map((t) => (
              <Button
                key={t.key}
                variant="secondary"
                size="lg"
                onClick={() => onShare(t.key, identity)}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
