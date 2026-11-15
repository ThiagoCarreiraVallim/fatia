'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MealDetailScreen } from '@/components/nutrition/meal-detail-screen';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function MealPageContent() {
  const { id } = useParams<{ id: string }>();
  // O dia vem de quem abriu (a lista do dia); sem ele, a volta cai em hoje.
  const date = useSearchParams().get('date') ?? todayIso();
  return <MealDetailScreen key={id} id={id} date={date} />;
}

export default function MealPage() {
  return (
    <Suspense>
      <MealPageContent />
    </Suspense>
  );
}
