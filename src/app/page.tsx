import LanguageSwitcher from '@/components/LanguageSwitcher'

const features = [
  "Адаптивный тест подстраивается под тебя",
  "Без регистрации — начни прямо сейчас",
  "С аккаунтом сохранишь прогресс и сможешь продолжить",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-cream flex flex-col animate-fade-up">

      <nav className="flex items-center justify-end gap-8 px-8 pt-5">
        <button className="text-sm text-muted hover:text-graphite transition-colors">
          Войти
        </button>
        <LanguageSwitcher />
      </nav>

      <div className="flex-1 flex items-center py-6 md:py-10 lg:py-14">
        <div className="mx-auto w-full max-w-3xl px-8 flex flex-col gap-5 md:gap-6 lg:gap-8">

          <div className="flex flex-col items-center gap-3 lg:gap-5">
            <h1 className="font-serif font-light text-5xl md:text-6xl lg:text-7xl leading-none text-graphite tracking-tight">
              Erudite
            </h1>
            <div className="h-px w-10 bg-divider" />
          </div>

          <div className="flex flex-col gap-2 md:gap-3">
            <p className="text-xl md:text-2xl lg:text-3xl text-graphite leading-snug">
              Узнай, сколько известных людей ты знаешь
            </p>
            <p className="text-sm md:text-base lg:text-lg text-muted">
              Из 15 000 самых знаменитых в мировой истории
            </p>
          </div>

          <p className="text-sm md:text-base lg:text-xl leading-relaxed text-graphite">
            Алгоритм адаптивного тестирования — тот же, что в IQ-тестах.
            По 100 ответам он определяет твой уровень и точно оценивает
            знание всех 15 000 фигур.
          </p>

          <ul className="flex flex-col gap-2 md:gap-3 lg:gap-4">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm md:text-base text-muted">
                <span className="text-emerald-deep text-base md:text-lg leading-none">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="flex justify-center">
            <button className="bg-emerald-deep text-white font-medium rounded-2xl hover:opacity-90 transition-opacity min-w-[280px] text-base px-10 py-4 lg:text-lg lg:px-12 lg:py-5">
              Начать тест
            </button>
          </div>

        </div>
      </div>

    </main>
  );
}
