import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { safeNextPath } from '@/lib/next-path';

type Props = { searchParams: Promise<{ refazer?: string; next?: string }> };

/**
 * `?refazer=1` vem de "Recalcular com meus dados", nas metas: volta para lá no fim.
 * `?next=` vem do `OnboardingGate`: o link pelo qual a pessoa chegou.
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const { refazer, next } = await searchParams;
  return <OnboardingWizard redo={refazer === '1'} returnTo={safeNextPath(next)} />;
}
