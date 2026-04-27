'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { RegionId } from '@/data/regions'

export default function RegionPicker({ regionIds }: { regionIds: RegionId[] }) {
  const t = useTranslations('regions')
  const router = useRouter()

  function handleSelect(id: RegionId) {
    localStorage.setItem('user_region', id)
    router.push('/quiz')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {regionIds.map((id) => (
        <button
          key={id}
          onClick={() => handleSelect(id)}
          className="w-full text-left px-5 py-4 rounded-xl border border-divider bg-cream hover:bg-divider/50 transition-colors text-graphite text-sm md:text-base font-medium"
        >
          {t(id)}
        </button>
      ))}
    </div>
  )
}
