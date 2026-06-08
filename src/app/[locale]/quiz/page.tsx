import { redirect } from 'next/navigation'

// Stage 6.4: the old "Тест почти готов" placeholder is removed. Region selection is
// mandatory, so any stale /quiz link is sent to onboarding (the same target as the
// landing CTA), not straight into the game.
export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/onboarding`)
}
