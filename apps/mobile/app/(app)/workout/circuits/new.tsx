import { useState } from 'react';
import { newCircuitDraft } from '@fatia/api-client';
import { CircuitEditor } from '@/components/workout/circuit/circuit-editor';

/** Novo circuito (Al-T22, #380). */
export default function NewCircuitScreen() {
  const [initial] = useState(newCircuitDraft);
  return <CircuitEditor initial={initial} />;
}
