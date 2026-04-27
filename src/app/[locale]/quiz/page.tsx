import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import QuizStub from '@/components/QuizStub'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations()

  return (
    <main className="min-h-screen bg-cream flex flex-col animate-fade-up">

      <nav className="flex items-center justify-end gap-8 px-8 pt-5">
        <button className="text-sm text-muted hover:text-graphite transition-colors">
          {t('loginButton')}
        </button>
        <LanguageSwitcher />
      </nav>

      <QuizStub />

    </main>
  )
}
