'use client';

import { use } from 'react';
import { DemoSessionToday } from '@/components/demo/demo-session-today';

/** `/demo/<token>`: o Hoje da Ana Exemplo, só leitura (#412). */
export default function DemoSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <DemoSessionToday token={decodeURIComponent(token)} />;
}
