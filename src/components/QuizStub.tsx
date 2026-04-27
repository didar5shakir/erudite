'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, Link } from '@/i18n/navigation'
import type { RegionId } from '@/data/regions'

export default function QuizStub() {
  const t = useTranslations()
  const router = useRouter()
  const [regionId, setRegionId] = useState<RegionId | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('user_region')
    if (!saved) {
      router.replace('/onboarding')
    } else {
      setRegionId(saved as RegionId)
      setReady(true)
    }
  }, [router])

  if (!ready) return null

  return (
    <div className="flex-1 flex items-center py-10 md:py-16">
      <div className="mx-auto w-full max-w-3xl px-8 flex flex-col gap-6">

        <h1 className="font-serif font-light text-4xl md:text-5xl text-graphite tracking-tight leading-tight">
          {t('quiz.title')}
        </h1>

        <p className="text-base md:text-lg text-muted leading-relaxed max-w-xl">
          {t('quiz.body')}
        </p>

        {regionId && (
          <p className="text-sm text-graphite">
            {t('quiz.regionSaved', { region: t(`regions.${regionId}` as Parameters<ReturnType<typeof useTranslations>>[0]) })}
          </p>
        )}

        <div>
          <Link
            href="/"
            className="text-sm text-muted hover:text-graphite transition-colors"
          >
            {t('quiz.backButton')}
          </Link>
        </div>

      </div>
    </div>
  )
}
