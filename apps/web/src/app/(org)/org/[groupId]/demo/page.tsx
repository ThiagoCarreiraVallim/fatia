'use client';

import { demoMenuLabel } from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { DemoSectionPage, useFirstSteps } from '@/components/org/demo-panel';
import { useOrgGroup } from '@/components/org/org-shell';

/**
 * "Demonstração" no menu (#412, Pn-21 e Pn-21c); "Primeiros passos" quando a
 * comunidade de verdade fica ativa (Pn-21d). Só a dona chega aqui.
 */
export default function PanelDemoPage() {
  const g = useOrgGroup();
  const steps = useFirstSteps(g);
  useTopBarTitle(demoMenuLabel(steps.data));
  return <DemoSectionPage g={g} />;
}
