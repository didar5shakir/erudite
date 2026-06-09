import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getOrderedRegionIds } from '@/data/regions'
import { decodeChallenge } from '@/lib/play/challenge'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import RegionPicker from '@/components/RegionPicker'

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations()
  const regionIds = getOrderedRegionIds(locale)

  // Optional "compare with a friend" link (?c=…). Forward the raw param to RegionPicker so
  // it survives region selection into /play; show the invite line only when it decodes.
  const { c } = await searchParams
  const challenge = typeof c === 'string' ? c : undefined
  const isChallenge = decodeChallenge(challenge) !== null

  return (
    <main className="min-h-screen bg-cream flex flex-col animate-fade-up">

      <nav className="flex items-center justify-end gap-8 px-8 pt-5">
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

          {isChallenge && (
            <p className="text-sm md:text-base text-emerald-deep bg-emerald-deep/5 border border-emerald-deep/15 rounded-xl px-4 py-3">
              {t('play.challenge_invite')}
            </p>
          )}

          <p className="text-sm md:text-base leading-relaxed text-muted border-l-2 border-divider pl-4">
            {t('onboarding.intro')}
          </p>

          <RegionPicker regionIds={regionIds} challenge={challenge} />

        </div>
      </div>

    </main>
  )
}
