import { HelpScreen } from '@/components/you/help-screen';

type Props = { searchParams: Promise<{ tutorial?: string }> };

/** Ajuda e tutoriais (pranchas Al-V12/V12b, #387). `?tutorial=` abre um direto (#388). */
export default async function Page({ searchParams }: Props) {
  const { tutorial } = await searchParams;
  return <HelpScreen initialTutorialId={tutorial} />;
}
