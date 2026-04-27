'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'

const languages = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Қазақ' },
]

export default function LanguageSwitcher() {
  const currentLocale = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(locale: string) {
    router.replace(pathname, { locale })
    setIsOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-muted hover:text-graphite transition-colors"
      >
        {currentLocale.toUpperCase()}
        <span
          className={`text-xs transition-transform duration-200 inline-block ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 min-w-[160px] rounded-xl border border-divider bg-cream shadow-md py-1 z-50">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-divider/60 transition-colors"
            >
              <span className={currentLocale === lang.code ? 'text-graphite font-medium' : 'text-muted'}>
                {lang.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted/70">{lang.code.toUpperCase()}</span>
                {currentLocale === lang.code && (
                  <span className="text-emerald-deep text-xs">✓</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
