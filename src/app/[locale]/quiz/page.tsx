import { redirect } from 'next/navigation'

// Stage 6.4: the old "Тест почти готов" placeholder is removed. The game is live, so
// any stale /quiz link is sent straight to it (same target as the landing CTA).
export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/play?region=kz`)
}
