"""
Шаг 2: Аналитика Pantheon + CSV-списки для просмотра.
Никаких фильтров, никаких удалений — только анализ сырых данных.

Выходные файлы:
  data/processed/pantheon_analysis.txt   — полный анализ
  data/processed/pantheon_top_500.csv    — топ-500 по HPI
  data/processed/pantheon_top_15000.csv  — топ-15000 по HPI
  data/processed/pantheon_full_sorted.csv — все фигуры по убыванию HPI
"""

import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
IN_PATH = ROOT / "data" / "raw" / "pantheon.csv"
OUT_DIR = ROOT / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ANALYSIS_PATH = OUT_DIR / "pantheon_analysis.txt"
TOP500_PATH = OUT_DIR / "pantheon_top_500.csv"
TOP15K_PATH = OUT_DIR / "pantheon_top_15000.csv"
FULL_PATH = OUT_DIR / "pantheon_full_sorted.csv"

# Маппинг occupation → domain (производный, т.к. в 2025-датасете domain нет)
DOMAIN_MAP: dict[str, str] = {
    # SPORTS
    "SOCCER PLAYER": "SPORTS", "ATHLETE": "SPORTS", "BASKETBALL PLAYER": "SPORTS",
    "CYCLIST": "SPORTS", "TENNIS PLAYER": "SPORTS", "SWIMMER": "SPORTS",
    "WRESTLER": "SPORTS", "RACING DRIVER": "SPORTS", "SKIER": "SPORTS",
    "HOCKEY PLAYER": "SPORTS", "BOXER": "SPORTS", "GYMNAST": "SPORTS",
    "HANDBALL PLAYER": "SPORTS", "SKATER": "SPORTS", "FENCER": "SPORTS",
    "VOLLEYBALL PLAYER": "SPORTS", "BADMINTON PLAYER": "SPORTS",
    "MARTIAL ARTS": "SPORTS", "COACH": "SPORTS", "CHESS PLAYER": "SPORTS",
    "GOLFER": "SPORTS", "RUGBY PLAYER": "SPORTS",
    "AMERICAN FOOTBALL PLAYER": "SPORTS", "BASEBALL PLAYER": "SPORTS",
    "ROWER": "SPORTS", "WEIGHTLIFTER": "SPORTS", "EQUESTRIAN": "SPORTS",
    "ARCHER": "SPORTS", "TRIATHLETE": "SPORTS", "SPRINTER": "SPORTS",
    "CANOEIST": "SPORTS", "JOCKEY": "SPORTS", "CRICKET PLAYER": "SPORTS",
    "POLO PLAYER": "SPORTS", "CURLER": "SPORTS", "BOBSLEDDER": "SPORTS",
    "WATER POLO PLAYER": "SPORTS", "PENTATHLETE": "SPORTS",
    "DISCUS THROWER": "SPORTS", "SHOT PUTTER": "SPORTS",

    # ARTS & ENTERTAINMENT
    "ACTOR": "ARTS & ENTERTAINMENT", "SINGER": "ARTS & ENTERTAINMENT",
    "MUSICIAN": "ARTS & ENTERTAINMENT", "FILM DIRECTOR": "ARTS & ENTERTAINMENT",
    "PAINTER": "ARTS & ENTERTAINMENT", "COMPOSER": "ARTS & ENTERTAINMENT",
    "SCULPTOR": "ARTS & ENTERTAINMENT", "ARCHITECT": "ARTS & ENTERTAINMENT",
    "MODEL": "ARTS & ENTERTAINMENT", "CELEBRITY": "ARTS & ENTERTAINMENT",
    "COMIC ARTIST": "ARTS & ENTERTAINMENT", "PORNOGRAPHIC ACTOR": "ARTS & ENTERTAINMENT",
    "PRESENTER": "ARTS & ENTERTAINMENT", "DANCER": "ARTS & ENTERTAINMENT",
    "PHOTOGRAPHER": "ARTS & ENTERTAINMENT", "COMEDIAN": "ARTS & ENTERTAINMENT",
    "SCREENWRITER": "ARTS & ENTERTAINMENT", "PLAYWRIGHT": "ARTS & ENTERTAINMENT",
    "FASHION DESIGNER": "ARTS & ENTERTAINMENT", "PRODUCER": "ARTS & ENTERTAINMENT",
    "ANIMATOR": "ARTS & ENTERTAINMENT", "VIDEO JOCKEY": "ARTS & ENTERTAINMENT",
    "ENGRAVER": "ARTS & ENTERTAINMENT", "ILLUSTRATOR": "ARTS & ENTERTAINMENT",
    "CARICATURIST": "ARTS & ENTERTAINMENT",

    # SCIENCE & TECHNOLOGY
    "PHYSICIST": "SCIENCE & TECHNOLOGY", "MATHEMATICIAN": "SCIENCE & TECHNOLOGY",
    "BIOLOGIST": "SCIENCE & TECHNOLOGY", "CHEMIST": "SCIENCE & TECHNOLOGY",
    "ASTRONOMER": "SCIENCE & TECHNOLOGY", "ENGINEER": "SCIENCE & TECHNOLOGY",
    "INVENTOR": "SCIENCE & TECHNOLOGY", "COMPUTER SCIENTIST": "SCIENCE & TECHNOLOGY",
    "PHYSICIAN": "SCIENCE & TECHNOLOGY", "ARCHAEOLOGIST": "SCIENCE & TECHNOLOGY",
    "GEOLOGIST": "SCIENCE & TECHNOLOGY", "NATURALIST": "SCIENCE & TECHNOLOGY",
    "ASTRONAUT": "SCIENCE & TECHNOLOGY", "BOTANIST": "SCIENCE & TECHNOLOGY",
    "ZOOLOGIST": "SCIENCE & TECHNOLOGY", "PALEONTOLOGIST": "SCIENCE & TECHNOLOGY",
    "METEOROLOGIST": "SCIENCE & TECHNOLOGY", "OCEANOGRAPHER": "SCIENCE & TECHNOLOGY",
    "GENETICIST": "SCIENCE & TECHNOLOGY", "NEUROSCIENTIST": "SCIENCE & TECHNOLOGY",
    "PHARMACOLOGIST": "SCIENCE & TECHNOLOGY",

    # HUMANITIES
    "WRITER": "HUMANITIES", "PHILOSOPHER": "HUMANITIES", "HISTORIAN": "HUMANITIES",
    "ECONOMIST": "HUMANITIES", "JOURNALIST": "HUMANITIES",
    "SOCIAL ACTIVIST": "HUMANITIES", "PSYCHOLOGIST": "HUMANITIES",
    "LINGUIST": "HUMANITIES", "POET": "HUMANITIES", "THEOLOGIAN": "HUMANITIES",
    "ANTHROPOLOGIST": "HUMANITIES", "SOCIOLOGIST": "HUMANITIES",
    "POLITICAL SCIENTIST": "HUMANITIES", "JURIST": "HUMANITIES",
    "GEOGRAPHER": "HUMANITIES",

    # POLITICS & LEADERSHIP
    "POLITICIAN": "POLITICS & LEADERSHIP", "MILITARY PERSONNEL": "POLITICS & LEADERSHIP",
    "NOBLEMAN": "POLITICS & LEADERSHIP", "EXPLORER": "POLITICS & LEADERSHIP",
    "BUSINESSPERSON": "POLITICS & LEADERSHIP", "EXTREMIST": "POLITICS & LEADERSHIP",
    "SPY": "POLITICS & LEADERSHIP", "NAVIGATOR": "POLITICS & LEADERSHIP",
    "COLONIST": "POLITICS & LEADERSHIP", "DIPLOMAT": "POLITICS & LEADERSHIP",

    # RELIGION
    "RELIGIOUS FIGURE": "RELIGION", "COMPANION": "RELIGION",
    "SAINT": "RELIGION", "POPE": "RELIGION", "IMAM": "RELIGION",
    "PROPHET": "RELIGION", "MISSIONARY": "RELIGION",
}


def get_domain(occ) -> str:
    if pd.isna(occ):
        return "OTHER"
    return DOMAIN_MAP.get(str(occ).upper(), "OTHER")


def get_era(year) -> str:
    if pd.isna(year):
        return "Unknown"
    y = int(year)
    if y < 0:
        cent = (abs(y) - 1) // 100 + 1
        return f"{cent}00s BCE"
    cent = y // 100 * 100
    return f"{cent}s"


# ── Основная работа ────────────────────────────────────────────────────────────

def main():
    print(f"Загружаю {IN_PATH} ...")
    df = pd.read_csv(IN_PATH, low_memory=False)
    print(f"Загружено: {len(df):,} записей")

    # Производные колонки
    df["domain"] = df["occupation"].apply(get_domain)
    df["era"] = df["birthyear"].apply(get_era)
    df["wikipedia_url"] = "https://en.wikipedia.org/wiki/" + df["slug"].fillna("")

    # Сортировка по HPI убывающе
    df_sorted = df.sort_values("hpi", ascending=False).reset_index(drop=True)
    df_sorted["rank"] = df_sorted.index + 1

    top15k = df_sorted.head(15_000)
    top500 = df_sorted.head(500)

    # ── ЧАСТЬ 1: Аналитика ─────────────────────────────────────────────────────
    lines: list[str] = []

    def h(title: str) -> None:
        lines.append("")
        lines.append("=" * 70)
        lines.append(title)
        lines.append("=" * 70)

    def p(text: str = "") -> None:
        lines.append(text)

    h("PANTHEON 2025 — АНАЛИТИЧЕСКИЙ ОТЧЁТ")
    p(f"Источник: {IN_PATH.name}")
    p(f"Дата анализа: {pd.Timestamp.now().strftime('%Y-%m-%d')}")

    # 1. Общая статистика
    h("1. ОБЩАЯ СТАТИСТИКА")
    hpi = df["hpi"].dropna()
    p(f"Всего фигур: {len(df):,}")
    p(f"С известным HPI: {len(hpi):,}")
    p()
    p(f"HPI — распределение:")
    p(f"  min        = {hpi.min():.2f}")
    p(f"  Q25        = {hpi.quantile(0.25):.2f}")
    p(f"  медиана    = {hpi.median():.2f}")
    p(f"  Q75        = {hpi.quantile(0.75):.2f}")
    p(f"  Q90        = {hpi.quantile(0.90):.2f}")
    p(f"  Q95        = {hpi.quantile(0.95):.2f}")
    p(f"  Q99        = {hpi.quantile(0.99):.2f}")
    p(f"  max        = {hpi.max():.2f}")
    p()
    p("Гистограмма HPI:")
    edges = list(range(0, 110, 10))
    for lo, hi_val in zip(edges, edges[1:]):
        cnt = ((hpi >= lo) & (hpi < hi_val)).sum()
        bar = "█" * (cnt * 40 // len(hpi))
        p(f"  {lo:>3}–{hi_val:<3}  {cnt:>7,}  {bar}")
    cnt100 = (hpi == 100).sum()
    p(f"  = 100    {cnt100:>7,}")

    # 2. Топ-30 occupation
    h("2. ТОП-30 ПРОФЕССИЙ (occupation)")
    occ_stats = df.groupby("occupation")["hpi"].agg(["count", "mean"]).reset_index()
    occ_stats.columns = ["occupation", "count", "mean_hpi"]
    occ_stats = occ_stats.sort_values("count", ascending=False).head(30)
    p(f"  {'occupation':<35}  {'count':>7}  {'mean_hpi':>8}")
    p(f"  {'-'*35}  {'-'*7}  {'-'*8}")
    for _, row in occ_stats.iterrows():
        p(f"  {row['occupation']:<35}  {row['count']:>7,}  {row['mean_hpi']:>8.2f}")

    # 3. Распределение по domain
    h("3. РАСПРЕДЕЛЕНИЕ ПО DOMAIN (производный из occupation)")
    domain_stats = df.groupby("domain")["hpi"].agg(["count", "mean"]).reset_index()
    domain_stats.columns = ["domain", "count", "mean_hpi"]
    domain_stats = domain_stats.sort_values("count", ascending=False)
    p(f"  {'domain':<28}  {'count':>7}  {'%':>5}  {'mean_hpi':>8}")
    p(f"  {'-'*28}  {'-'*7}  {'-'*5}  {'-'*8}")
    for _, row in domain_stats.iterrows():
        pct = row["count"] / len(df) * 100
        p(f"  {row['domain']:<28}  {row['count']:>7,}  {pct:>4.1f}%  {row['mean_hpi']:>8.2f}")

    # 4. Топ-30 стран
    h("4. ТОП-30 СТРАН РОЖДЕНИЯ")
    country_cnt = df["bplace_country"].value_counts()
    top30_countries = country_cnt.head(30)
    p(f"  {'country':<35}  {'count':>7}  {'%':>5}")
    p(f"  {'-'*35}  {'-'*7}  {'-'*5}")
    for country, cnt in top30_countries.items():
        pct = cnt / len(df) * 100
        p(f"  {str(country):<35}  {cnt:>7,}  {pct:>4.1f}%")
    us_cnt = country_cnt.get("United States", 0)
    uk_cnt = country_cnt.get("United Kingdom", 0)
    p()
    us_pct = us_cnt / len(df) * 100
    uk_pct = uk_cnt / len(df) * 100
    p(f"  США + UK вместе: {us_cnt + uk_cnt:,} ({us_pct + uk_pct:.1f}% от всей базы)")

    # 5. По столетиям
    h("5. РАСПРЕДЕЛЕНИЕ ПО ЭПОХАМ (столетие рождения)")
    era_cnt = df["era"].value_counts()
    # Сортировка: сначала BCE убывающе, потом CE возрастающе
    bce = sorted([(e, c) for e, c in era_cnt.items() if "BCE" in str(e)], reverse=True)
    ce = sorted([(e, c) for e, c in era_cnt.items() if "BCE" not in str(e) and e != "Unknown"],
                key=lambda x: int(str(x[0]).replace("s", "") or 0))
    unk = [(e, c) for e, c in era_cnt.items() if e == "Unknown"]
    for era_label, cnt in bce + ce + unk:
        bar = "█" * (cnt * 30 // len(df))
        p(f"  {str(era_label):<14}  {cnt:>7,}  {bar}")

    # 6. Пол
    h("6. РАСПРЕДЕЛЕНИЕ ПО ПОЛУ")
    gender_cnt = df["gender"].value_counts(dropna=False)
    for g, cnt in gender_cnt.items():
        pct = cnt / len(df) * 100
        p(f"  {str(g):<8}  {cnt:>7,}  ({pct:.1f}%)")

    # 7. Топ-15000 по HPI
    h("7. ЧТО В ТОП-15 000 (по чистому HPI)")
    hpi_threshold = df_sorted.iloc[14999]["hpi"] if len(df_sorted) >= 15000 else df_sorted["hpi"].min()
    p(f"HPI на 15 000-м месте (порог): {hpi_threshold:.4f}")
    p()
    p("Топ-30 профессий в топ-15000:")
    occ15k = top15k.groupby("occupation")["hpi"].agg(["count", "mean"]).reset_index()
    occ15k.columns = ["occupation", "count", "mean_hpi"]
    occ15k = occ15k.sort_values("count", ascending=False).head(30)
    p(f"  {'occupation':<35}  {'count':>5}  {'%':>5}  {'mean_hpi':>8}")
    p(f"  {'-'*35}  {'-'*5}  {'-'*5}  {'-'*8}")
    for _, row in occ15k.iterrows():
        pct = row["count"] / 15000 * 100
        p(f"  {row['occupation']:<35}  {row['count']:>5,}  {pct:>4.1f}%  {row['mean_hpi']:>8.2f}")
    p()
    p("Топ-15 стран в топ-15000:")
    country15k = top15k["bplace_country"].value_counts().head(15)
    for country, cnt in country15k.items():
        pct = cnt / 15000 * 100
        p(f"  {str(country):<35}  {cnt:>5,}  {pct:>4.1f}%")
    us15k = top15k["bplace_country"].eq("United States").sum()
    uk15k = top15k["bplace_country"].eq("United Kingdom").sum()
    p()
    p(f"  США + UK в топ-15000: {us15k + uk15k:,} ({(us15k + uk15k)/150:.1f}%)")
    p()
    p("Распределение эпох в топ-15000:")
    era15k = top15k["era"].value_counts()
    bce15 = sorted([(e, c) for e, c in era15k.items() if "BCE" in str(e)], reverse=True)
    ce15 = sorted([(e, c) for e, c in era15k.items() if "BCE" not in str(e) and e != "Unknown"],
                  key=lambda x: int(str(x[0]).replace("s", "") or 0))
    unk15 = [(e, c) for e, c in era15k.items() if e == "Unknown"]
    for era_label, cnt in bce15 + ce15 + unk15:
        bar = "█" * (cnt * 30 // 15000)
        p(f"  {str(era_label):<14}  {cnt:>5,}  {bar}")

    # Запись анализа в файл
    text = "\n".join(lines)
    ANALYSIS_PATH.write_text(text, encoding="utf-8")
    print(f"\nАнализ сохранён: {ANALYSIS_PATH}")

    # Печатаем в консоль тоже
    print(text)

    # ── ЧАСТЬ 2: CSV-файлы ─────────────────────────────────────────────────────
    csv_cols = ["rank", "name", "occupation", "domain", "bplace_country",
                "birthyear", "deathyear", "era", "hpi", "gender", "wikipedia_url"]

    def save_csv(data: pd.DataFrame, path: Path, label: str) -> None:
        out = data[csv_cols].rename(columns={"bplace_country": "country",
                                             "birthyear": "birth_year",
                                             "deathyear": "death_year"})
        out.to_csv(path, index=False, encoding="utf-8-sig")  # utf-8-sig = BOM для Excel
        mb = path.stat().st_size / 1024 / 1024
        print(f"{label}: {path}  ({len(out):,} строк, {mb:.1f} МБ)")

    print("\n" + "=" * 70)
    print("СОХРАНЯЮ CSV-ФАЙЛЫ")
    print("=" * 70)
    save_csv(top500, TOP500_PATH, "Топ-500  ")
    save_csv(top15k, TOP15K_PATH, "Топ-15000")
    save_csv(df_sorted, FULL_PATH, "Все фигуры")

    print("\nГотово.")


if __name__ == "__main__":
    main()
