import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  const features = [
    t('features.adaptive'),
    t('features.noLogin'),
    t('features.withAccount'),
  ];

  return (
    <main className="min-h-screen bg-cream flex flex-col animate-fade-up">

      <nav className="flex items-center justify-end gap-8 px-8 pt-5">
        <button className="text-sm text-muted hover:text-graphite transition-colors">
          {t('loginButton')}
        </button>
        <LanguageSwitcher />
      </nav>

      <div className="flex-1 flex items-center py-6 md:py-10 lg:py-14">
        <div className="mx-auto w-full max-w-3xl px-8 flex flex-col gap-5 md:gap-6 lg:gap-8">

          <div className="flex flex-col items-center gap-3 lg:gap-5">
            <h1 className="font-serif font-light text-5xl md:text-6xl lg:text-7xl leading-none text-graphite tracking-tight">
              {t('brand')}
            </h1>
            <div className="h-px w-10 bg-divider" />
          </div>

          <div className="flex flex-col gap-2 md:gap-3">
            <p className="text-xl md:text-2xl lg:text-3xl text-graphite leading-snug">
              {t('tagline')}
            </p>
            <p className="text-sm md:text-base lg:text-lg text-muted">
              {t('description')}
            </p>
          </div>

          <p className="text-sm md:text-base lg:text-xl leading-relaxed text-graphite">
            {t('method')}
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
            <Link
              href="/onboarding"
              className="bg-emerald-deep text-white font-medium rounded-2xl hover:opacity-90 transition-opacity min-w-[280px] text-base px-10 py-4 lg:text-lg lg:px-12 lg:py-5 inline-flex items-center justify-center"
            >
              {t('startButton')}
            </Link>
          </div>

        </div>
      </div>

    </main>
  );
}
