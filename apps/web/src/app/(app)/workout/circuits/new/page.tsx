'use client';

import { useState } from 'react';
import { newCircuitDraft } from '@fatia/api-client';
import { CircuitEditor } from '@/components/workout/circuit/circuit-editor';

/** Novo circuito (prancha Al-T22, #380). */
export default function NewCircuitPage() {
  const [initial] = useState(newCircuitDraft);
  return <CircuitEditor initial={initial} />;
}
