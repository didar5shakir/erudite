'use client'

import { useState, useEffect, useRef } from 'react'

const languages = [
  { code: 'EN', label: 'English' },
  { code: 'RU', label: 'Русский' },
  { code: 'KK', label: 'Қазақ' },
]

export default function LanguageSwitcher() {
  const [selected, setSelected] = useState('RU')
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-muted hover:text-graphite transition-colors"
      >
        {selected}
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
              onClick={() => { setSelected(lang.code); setIsOpen(false) }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-divider/60 transition-colors"
            >
              <span className={selected === lang.code ? 'text-graphite font-medium' : 'text-muted'}>
                {lang.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted/70">{lang.code}</span>
                {selected === lang.code && (
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
