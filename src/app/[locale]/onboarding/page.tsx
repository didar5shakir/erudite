import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { getOrderedRegionIds } from '@/data/regions'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import RegionPicker from '@/components/RegionPicker'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations()
  const regionIds = getOrderedRegionIds(locale)

  return (
    <main className="min-h-screen bg-cream flex flex-col animate-fade-up">

      <nav className="flex items-center justify-end gap-8 px-8 pt-5">
        <button className="text-sm text-muted hover:text-graphite transition-colors">
          {t('loginButton')}
        </button>
        <LanguageSwitcher />
      </nav>

      <div className="flex-1 flex items-center py-6 md:py-10 lg:py-14">
        <div className="mx-auto w-full max-w-3xl px-8 flex flex-col gap-8">

          <div className="flex flex-col gap-2">
            <h1 className="font-serif font-light text-4xl md:text-5xl text-graphite tracking-tight leading-tight">
              {t('onboarding.title')}
            </h1>
            <p className="text-base md:text-lg text-muted">
              {t('onboarding.subtitle')}
            </p>
          </div>

          <RegionPicker regionIds={regionIds} />

        </div>
      </div>

    </main>
  )
}
