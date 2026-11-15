import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { safeNextPath } from '@/lib/next-path';

type Props = { searchParams: Promise<{ refazer?: string; next?: string; convite?: string }> };

const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * `?refazer=1` vem de "Recalcular com meus dados" e de "Refazer" em Primeiros
 * passos: refaz objetivo, corpo e metas.
 * `?next=` vem do `OnboardingGate`: o link pelo qual a pessoa chegou.
 * `?convite=` vem do link de convite (`/c/<token>`): abre as boas-vindas da comunidade.
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const { refazer, next, convite } = await searchParams;
  return (
    <OnboardingFlow
      redo={refazer === '1'}
      returnTo={safeNextPath(next)}
      inviteToken={convite && TOKEN.test(convite) ? convite : null}
    />
  );
}
