import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

type Props = { searchParams: Promise<{ refazer?: string }> };

/** `?refazer=1` vem de "Recalcular com meus dados", nas metas: volta para lá no fim. */
export default async function OnboardingPage({ searchParams }: Props) {
  const { refazer } = await searchParams;
  return <OnboardingWizard redo={refazer === '1'} />;
}
