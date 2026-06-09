'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { RegionId } from '@/data/regions'

// RegionPicker id → /play ?region= param. KZ uses the curated path; 'other' is global;
// the rest pass their own id so the sampler applies the matching macro-region boost.
const REGION_PARAM: Record<RegionId, string> = {
  kazakhstan_central_asia:  'kz',
  other:                    'global',
  russia_cis:               'russia_cis',
  europe:                   'europe',
  north_america:            'north_america',
  latin_america:            'latin_america',
  east_asia:                'east_asia',
  southeast_asia:           'southeast_asia',
  south_asia:               'south_asia',
  middle_east_north_africa: 'middle_east_north_africa',
}

export default function RegionPicker({ regionIds }: { regionIds: RegionId[] }) {
  const t = useTranslations('regions')
  const router = useRouter()

  function handleSelect(id: RegionId) {
    localStorage.setItem('user_region', id)
    // Start the real game with the explicit selected region. KZ/Central Asia maps to the
    // curated 'kz' path and 'other' to 'global'; every other region passes its own id so
    // /play applies the matching macro-region boost. Explicit selection always wins.
    router.push({ pathname: '/play', query: { region: REGION_PARAM[id] } })
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
